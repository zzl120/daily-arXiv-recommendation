from pydantic import BaseModel, Field, field_validator
import re

class Structure(BaseModel):
    tldr: str = Field(description="generate a too long; didn't read summary")
    motivation: str = Field(description="describe the motivation in this paper")
    method: str = Field(description="method of this paper")
    result: str = Field(description="result of this paper")
    conclusion: str = Field(description="conclusion of this paper")    
    author_affiliation: str = Field(description="the affiliation of the authors, e.g. MIT, Stanford University, Google, etc.")
    keywords: str = Field(description="three key topics or keywords of this paper, separated by comma")
