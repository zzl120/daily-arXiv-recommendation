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

        self.start_urls = [
            f"https://arxiv.org/list/{cat}/new" for cat in self.target_categories
        ]  # 起始URL（按类别爬取）

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
            
            # 提取论文分类信息 - 获取所有类别（主类别+次要类别）
            # 使用 .list-subjects 元素的完整文本内容
            subjects_text = paper_dd.css(".list-subjects::text").get()
            if not subjects_text:
                # 备用：获取主类别文本
                subjects_text = paper_dd.css(".list-subjects .primary-subject::text").get()
            
            # 提取论文标题
            title = paper_dd.css(".title::text").get()
            if title:
                title = title.strip()

            # 关键词过滤：如果配置了关键词，则只保留包含任意一个关键词的论文
            if self.keywords and title:
                title_lower = title.lower()
                if not any(kw in title_lower for kw in self.keywords):
                    self.logger.debug(f"Skipped paper {arxiv_id} - title '{title}' does not match keywords {self.keywords}")
                    continue

            if subjects_text:
                # 解析分类信息，通常格式如 "Computer Vision and Pattern Recognition (cs.CV)"
                # 提取括号中的分类代码
                categories_in_paper = re.findall(r'\(([^)]+)\)', subjects_text)
                
                # 检查论文分类是否与目标分类有交集
                paper_categories = set(categories_in_paper)
                if paper_categories.intersection(self.target_categories):
                    yield {
                        "id": arxiv_id,
                        "categories": list(paper_categories),  # 添加分类信息用于调试
                    }
                    self.logger.info(f"Found paper {arxiv_id} with categories {paper_categories}")
                else:
                    self.logger.debug(f"Skipped paper {arxiv_id} with categories {paper_categories} (not in target {self.target_categories})")
            else:
                # 如果无法获取分类信息，记录警告但仍然返回论文（保持向后兼容）
                self.logger.warning(f"Could not extract categories for paper {arxiv_id}, including anyway")
                yield {
                    "id": arxiv_id,
                    "categories": [],
                }
