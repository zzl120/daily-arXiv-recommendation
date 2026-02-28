import scrapy
import os
import re

class ArxivSpider(scrapy.Spider):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        categories = os.environ.get("CATEGORIES", "cs.CV")
        categories = categories.split(",")
        # 保存目标分类列表，用于后续验证
        self.target_categories = set(map(str.strip, categories))

        # 获取关键词过滤配置
        keywords = os.environ.get("KEYWORDS", "")
        if keywords:
            self.keywords = [k.strip().lower() for k in keywords.split(",") if k.strip()]
        else:
            self.keywords = []

        self.logger.info(f"目标分类: {self.target_categories}")
        self.logger.info(f"关键词过滤: {self.keywords}")

        self.start_urls = [
            f"https://arxiv.org/list/{cat}/new" for cat in self.target_categories
        ]  # 起始URL（计算机科学领域的最新论文）

    name = "arxiv"  # 爬虫名称
    allowed_domains = ["arxiv.org"]  # 允许爬取的域名

    def parse(self, response):
        # 提取每篇论文的信息
        anchors = []
        for li in response.css("div[id=dlpage] ul li"):
            href = li.css("a::attr(href)").get()
            if href and "item" in href:
                anchors.append(int(href.split("item")[-1]))

        # 遍历每篇论文的详细信息
        for paper in response.css("dl dt"):
            paper_anchor = paper.css("a[name^='item']::attr(name)").get()
            if not paper_anchor:
                continue
                
            paper_id = int(paper_anchor.split("item")[-1])
            if anchors and paper_id >= anchors[-1]:
                continue

            # 获取论文ID
            abstract_link = paper.css("a[title='Abstract']::attr(href)").get()
            if not abstract_link:
                continue
                
            arxiv_id = abstract_link.split("/")[-1]
            
            # 获取对应的论文描述部分 (dd元素)
            paper_dd = paper.xpath("following-sibling::dd[1]")
            if not paper_dd:
                continue
            
            # 提取论文标题 - 尝试多种方式
            title = ""
            # 方式1: 获取 .title 元素的所有文本（包括 <br> 标签转换后的内容）
            title_elem = paper_dd.css(".title")
            if title_elem:
                title = title_elem.get()
                if title:
                    # 清理 HTML 标签
                    title = re.sub(r'<[^>]+>', '', title)
                    title = title.strip()

            # 如果方式1失败，尝试方式2
            if not title:
                title = paper_dd.css(".title::text").get()
                if title:
                    title = title.strip()

            # 关键词过滤：如果配置了关键词，则只保留包含任意一个关键词的论文
            if self.keywords and title:
                title_lower = title.lower()
                if not any(kw in title_lower for kw in self.keywords):
                    self.logger.info(f"关键词过滤跳过: {arxiv_id} - '{title}' 不包含 {self.keywords}")
                    continue
            elif self.keywords and not title:
                self.logger.info(f"标题为空，跳过: {arxiv_id}")

            # 提取论文分类信息 - 在subjects部分
            subjects_text = paper_dd.css(".list-subjects .primary-subject::text").get()
            if not subjects_text:
                # 如果找不到主分类，尝试其他方式获取分类
                subjects_text = paper_dd.css(".list-subjects::text").get()
            
            if subjects_text:
                # 解析分类信息，通常格式如 "Computer Vision and Pattern Recognition (cs.CV)"
                # 提取括号中的分类代码
                categories_in_paper = re.findall(r'\(([^)]+)\)', subjects_text)
                
                # 检查论文分类是否与目标分类有交集
                paper_categories = set(categories_in_paper)
                if paper_categories.intersection(self.target_categories):
                    yield {
                        "id": arxiv_id,
                        "title": title,  # 添加标题
                        "categories": list(paper_categories),
                    }
                    self.logger.info(f"Found paper {arxiv_id}: {title[:50]}...")
                else:
                    self.logger.debug(f"Skipped paper {arxiv_id} with categories {paper_categories} (not in target {self.target_categories})")
            else:
                # 如果无法获取分类信息，记录警告但仍然返回论文（保持向后兼容）
                self.logger.warning(f"Could not extract categories for paper {arxiv_id}, including anyway")
                yield {
                    "id": arxiv_id,
                    "categories": [],
                }
