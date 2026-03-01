# Define your item pipelines here
#
# Don't forget to add your pipeline to the ITEM_PIPELINES setting
# See: https://docs.scrapy.org/en/latest/topics/item-pipeline.html


# useful for handling different item types with a single interface
import arxiv
import json
import os
import sys
from datetime import datetime, timedelta
from scrapy.exceptions import DropItem


class DailyArxivPipeline:
    def __init__(self):
        self.page_size = 100
        self.client = arxiv.Client(self.page_size)

        # 获取关键词过滤配置
        keywords = os.environ.get("KEYWORDS", "")
        if keywords:
            self.keywords = [k.strip().lower() for k in keywords.split(",") if k.strip()]
        else:
            self.keywords = []

        print(f"Pipeline 关键词过滤: {self.keywords}")

    def process_item(self, item: dict, spider):
        item["pdf"] = f"https://arxiv.org/pdf/{item['id']}"
        item["abs"] = f"https://arxiv.org/abs/{item['id']}"
        search = arxiv.Search(
            id_list=[item["id"]],
        )
        paper = next(self.client.results(search))
        item["authors"] = [a.name for a in paper.authors]
        item["title"] = paper.title
        item["categories"] = paper.categories
        item["comment"] = paper.comment
        item["summary"] = paper.summary

        # 关键词过滤：检查标题和摘要是否包含关键词
        if self.keywords:
            title_lower = item["title"].lower() if item["title"] else ""
            summary_lower = item["summary"].lower() if item["summary"] else ""

            if not any(kw in title_lower or kw in summary_lower for kw in self.keywords):
                raise DropItem(f"关键词过滤跳过: {item['id']} - '{item['title']}' 不包含关键词 {self.keywords}")

        return item
