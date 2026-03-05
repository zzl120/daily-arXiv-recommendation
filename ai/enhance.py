import os
import json
import sys
import re
import tarfile
import io
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional
from queue import Queue
from threading import Lock
# INSERT_YOUR_CODE
import requests

import dotenv
import argparse
from tqdm import tqdm

import langchain_core.exceptions
from langchain_openai import ChatOpenAI
from langchain.prompts import (
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate,
)
from structure import Structure

if os.path.exists('.env'):
    dotenv.load_dotenv()
template = open("template.txt", "r").read()
system = open("system.txt", "r").read()

# 缓存目录用于存储已下载的 LaTeX 源码
LATEX_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "latex_cache")
os.makedirs(LATEX_CACHE_DIR, exist_ok=True)

def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=str, required=True, help="jsonline data file")
    parser.add_argument("--max_workers", type=int, default=1, help="Maximum number of parallel workers")
    parser.add_argument("--use_full_paper", action="store_true", default=True, help="Use full paper content instead of just abstract")
    parser.add_argument("--max_paper_length", type=int, default=100000, help="Maximum length of paper content to send to LLM")
    return parser.parse_args()

def get_latex_source(arxiv_id: str) -> Optional[str]:
    """
    下载并提取 arXiv 论文的 LaTeX 源码内容。

    Args:
        arxiv_id: arXiv 论文 ID (如 2301.12345 或 2301.12345v1)

    Returns:
        提取的文本内容，如果失败返回 None
    """
    # 清理 arxiv_id，去掉版本号
    clean_id = arxiv_id.split('v')[0]
    cache_file = os.path.join(LATEX_CACHE_DIR, f"{clean_id}.txt")

    # 检查缓存
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            pass

    # 下载 LaTeX 源码 (tar.gz 格式)
    source_url = f"https://arxiv.org/e-print/{clean_id}"

    try:
        print(f"Downloading LaTeX source for {arxiv_id}...", file=sys.stderr)
        response = requests.get(source_url, timeout=60)

        if response.status_code != 200:
            print(f"Failed to download source for {arxiv_id}: status {response.status_code}", file=sys.stderr)
            return None

        # 解压 tar.gz 文件
        content = b""
        try:
            # 将下载的内容作为 tarfile 处理
            with tarfile.open(fileobj=io.BytesIO(response.content), mode="r:gz") as tar:
                # 遍历所有文件
                for member in tar.getmembers():
                    if member.isfile():
                        # 只处理 .tex 文件
                        if member.name.endswith('.tex'):
                            f = tar.extractfile(member)
                            if f:
                                content += f.read()
        except Exception as e:
            # 如果不是 tar.gz，可能是单个文件
            content = response.content

        # 尝试解码为文本
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            try:
                text = content.decode('latin-1')
            except Exception:
                print(f"Failed to decode source for {arxiv_id}", file=sys.stderr)
                return None

        # 清理 LaTeX 特殊字符和命令，保留可读文本
        # 移除注释
        text = re.sub(r'%.*$', '', text, flags=re.MULTILINE)
        # 移除一些常见的 LaTeX 命令（简化处理）
        text = re.sub(r'\\begin\{[^}]+\}', '', text)
        text = re.sub(r'\\end\{[^}]+\}', '', text)
        text = re.sub(r'\\[a-zA-Z]+\{[^}]*\}', '', text)
        text = re.sub(r'\\[a-zA-Z]+', ' ', text)
        # 移除数学公式标记
        text = re.sub(r'\[.*?\]', ' ', text)
        text = re.sub(r'\(.*?\)', ' ', text)
        # 清理多余空白
        text = re.sub(r'\s+', ' ', text)

        # 缓存结果
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                f.write(text)
        except Exception:
            pass

        return text

    except Exception as e:
        print(f"Error downloading source for {arxiv_id}: {e}", file=sys.stderr)
        return None

def process_single_item(chain, item: Dict, language: str, use_full_paper: bool = True, max_paper_length: int = 8000) -> Dict:
    def check_github_code(content: str) -> Dict:
        """提取并验证 GitHub 链接"""
        code_info = {}

        # 1. 优先匹配 github.com/owner/repo 格式
        github_pattern = r"https?://github\.com/([a-zA-Z0-9-_]+)/([a-zA-Z0-9-_\.]+)"
        match = re.search(github_pattern, content)
        
        if match:
            owner, repo = match.groups()
            # 清理 repo 名称，去掉可能的 .git 后缀或末尾的标点
            repo = repo.rstrip(".git").rstrip(".,)")
            
            full_url = f"https://github.com/{owner}/{repo}"
            code_info["code_url"] = full_url
            
            # 尝试调用 GitHub API 获取信息
            github_token = os.environ.get("TOKEN_GITHUB")
            headers = {"Accept": "application/vnd.github.v3+json"}
            if github_token:
                headers["Authorization"] = f"token {github_token}"
            
            try:
                api_url = f"https://api.github.com/repos/{owner}/{repo}"
                resp = requests.get(api_url, headers=headers, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    code_info["code_stars"] = data.get("stargazers_count", 0)
                    code_info["code_last_update"] = data.get("pushed_at", "")[:10]
            except Exception:
                # API 调用失败不影响主流程
                pass
            return code_info

        # 2. 如果没有 github.com，尝试匹配 github.io
        github_io_pattern = r"https?://[a-zA-Z0-9-_]+\.github\.io(?:/[a-zA-Z0-9-_\.]+)*"
        match_io = re.search(github_io_pattern, content)
        
        if match_io:
            url = match_io.group(0)
            # 清理末尾标点
            url = url.rstrip(".,)")
            code_info["code_url"] = url
            # github.io 不进行 star 和 update 判断
                
        return code_info

    # 检测代码可用性
    code_info = check_github_code(item.get("summary", ""))
    if code_info:
        item.update(code_info)

    """处理单个数据项"""
    # Default structure with meaningful fallback values
    default_ai_fields = {
        "tldr": "Summary generation failed",
        "motivation": "Motivation analysis unavailable",
        "method": "Method extraction failed",
        "result": "Result analysis unavailable",
        "conclusion": "Conclusion extraction failed",
        "author_affiliation": "",
        "keywords": ""
    }
    
    # 获取论文内容：优先使用 LaTeX 源码，否则使用摘要
    paper_content = item.get('summary', '')

    if use_full_paper:
        # 从 item 中获取 arxiv_id
        arxiv_id = item.get('arxiv_id', '')
        if not arxiv_id:
            # 尝试从 id 字段提取
            item_id = item.get('id', '')
            if 'arxiv.org' in item_id:
                arxiv_id = item_id.split('/')[-1]
            else:
                arxiv_id = item_id

        if arxiv_id:
            latex_content = get_latex_source(arxiv_id)
            if latex_content:
                # 打印部分内容以确认解析正确
                print(f"\n=== LaTeX content preview for {arxiv_id} ===", file=sys.stderr)
                preview = latex_content[:500].replace('\n', ' ')
                print(f"{preview}...", file=sys.stderr)
                print(f"=== End of preview (total: {len(latex_content)} chars) ===\n", file=sys.stderr)

                # 截取到指定长度
                if len(latex_content) > max_paper_length:
                    latex_content = latex_content[:max_paper_length]
                paper_content = latex_content
                print(f"Using full paper content for {arxiv_id}: {len(paper_content)} chars", file=sys.stderr)

    try:
        response: Structure = chain.invoke({
            "language": language,
            "content": paper_content
        })
        item['AI'] = response.model_dump()
    except langchain_core.exceptions.OutputParserException as e:
        # 尝试从错误信息中提取 JSON 字符串并修复
        error_msg = str(e)
        partial_data = {}
        
        if "Function Structure arguments:" in error_msg:
            try:
                # 提取 JSON 字符串
                json_str = error_msg.split("Function Structure arguments:", 1)[1].strip().split('are not valid JSON')[0].strip()
                # 预处理 LaTeX 数学符号 - 使用四个反斜杠来确保正确转义
                json_str = json_str.replace('\\', '\\\\')
                # 尝试解析修复后的 JSON
                partial_data = json.loads(json_str)
            except Exception as json_e:
                print(f"Failed to parse JSON for {item.get('id', 'unknown')}: {json_e}", file=sys.stderr)
        
        # Merge partial data with defaults to ensure all fields exist
        item['AI'] = {**default_ai_fields, **partial_data}
        print(f"Using partial AI data for {item.get('id', 'unknown')}: {list(partial_data.keys())}", file=sys.stderr)
    except Exception as e:
        # Catch any other exceptions and provide default values
        print(f"Unexpected error for {item.get('id', 'unknown')}: {e}", file=sys.stderr)
        item['AI'] = default_ai_fields
    
    # Final validation to ensure all required fields exist
    for field in default_ai_fields.keys():
        if field not in item['AI']:
            item['AI'][field] = default_ai_fields[field]

    return item

def process_all_items(data: List[Dict], model_name: str, language: str, max_workers: int, use_full_paper: bool = True, max_paper_length: int = 8000) -> List[Dict]:
    """并行处理所有数据项"""
    llm = ChatOpenAI(model=model_name).with_structured_output(Structure, method="function_calling")
    print('Connect to:', model_name, file=sys.stderr)
    
    prompt_template = ChatPromptTemplate.from_messages([
        SystemMessagePromptTemplate.from_template(system),
        HumanMessagePromptTemplate.from_template(template=template)
    ])

    chain = prompt_template | llm
    
    # 使用线程池并行处理
    processed_data = [None] * len(data)  # 预分配结果列表
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 提交所有任务
        future_to_idx = {
            executor.submit(process_single_item, chain, item, language, use_full_paper, max_paper_length): idx
            for idx, item in enumerate(data)
        }
        
        # 使用tqdm显示进度
        for future in tqdm(
            as_completed(future_to_idx),
            total=len(data),
            desc="Processing items"
        ):
            idx = future_to_idx[future]
            try:
                result = future.result()
                processed_data[idx] = result
            except Exception as e:
                print(f"Item at index {idx} generated an exception: {e}", file=sys.stderr)
                # Add default AI fields to ensure consistency
                processed_data[idx] = data[idx]
                processed_data[idx]['AI'] = {
                    "tldr": "Processing failed",
                    "motivation": "Processing failed",
                    "method": "Processing failed",
                    "result": "Processing failed",
                    "conclusion": "Processing failed"
                }
    
    return processed_data

def main():
    args = parse_args()
    model_name = os.environ.get("MODEL_NAME", 'deepseek-chat')
    language = os.environ.get("LANGUAGE", 'Chinese')

    # 检查并删除目标文件
    target_file = args.data.replace('.jsonl', f'_AI_enhanced_{language}.jsonl')
    if os.path.exists(target_file):
        os.remove(target_file)
        print(f'Removed existing file: {target_file}', file=sys.stderr)

    # 读取数据
    data = []
    with open(args.data, "r") as f:
        for line in f:
            data.append(json.loads(line))

    # 去重
    seen_ids = set()
    unique_data = []
    for item in data:
        if item['id'] not in seen_ids:
            seen_ids.add(item['id'])
            unique_data.append(item)

    data = unique_data
    print('Open:', args.data, file=sys.stderr)
    
    # 并行处理所有数据
    processed_data = process_all_items(
        data,
        model_name,
        language,
        args.max_workers,
        args.use_full_paper,
        args.max_paper_length
    )
    
    # 保存结果
    with open(target_file, "w") as f:
        for item in processed_data:
            if item is not None:
                f.write(json.dumps(item) + "\n")

if __name__ == "__main__":
    main()
