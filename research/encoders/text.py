"""Explicit text encoders. A requested MiniLM experiment never silently falls back."""
from __future__ import annotations
import hashlib
import os
import re
import struct
from abc import ABC,abstractmethod
import numpy as np
try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer=None

class TextEncoder(ABC):
    name: str
    dim: int
    @abstractmethod
    def encode(self,text):raise NotImplementedError
    def encode_batch(self,texts):return np.vstack([self.encode(text) for text in texts])

def _stable_hash(seed,gram):
    return struct.unpack("<Q",hashlib.blake2b(f"{seed}:{gram}".encode(),digest_size=8).digest())[0]

class HashingTextEncoder(TextEncoder):
    name="hashing-384"
    def __init__(self,dim=384,ngram_range=(3,5),seed=42):
        self.dim=dim;self.ngram_range=ngram_range;self.seed=seed
    def _ngrams(self,text):
        cleaned=" ".join(text.lower().split())
        lo,hi=self.ngram_range
        return cleaned.split()+[cleaned[i:i+n] for n in range(lo,hi+1) for i in range(max(0,len(cleaned)-n+1))]
    def encode(self,text):
        vec=np.zeros(self.dim,dtype=np.float64)
        for gram in self._ngrams(text):
            h=_stable_hash(self.seed,gram)
            vec[h%self.dim]+=1. if ((h//self.dim)%2)==0 else -1.
        cues=[("@",0),(".com",1),("email",2),("phone",3),("call",4),("ssn",5),("social security",6),
              ("password",7),("api key",8),("dob",9),("date of birth",10),("street",11),("address",12),
              ("patient",13),("diagnos",14),("iban",15),("salary",16),("passport",17),("license",18),("card number",19)]
        for needle,slot in cues:
            if needle in text.lower():vec[slot]+=2.5
        if re.search(r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b",text):vec[3]+=2.
        if re.search(r"\b\d{3}-\d{2}-\d{4}\b",text):vec[5]+=2.5
        if re.search(r"\b(?:\d[ -]*?){13,19}\b",text):vec[19]+=2.
        norm=np.linalg.norm(vec)
        if norm>0:vec/=norm
        return vec.astype(np.float32)

class SentenceTransformerEncoder(TextEncoder):
    name="sentence-transformers"
    def __init__(self,model_name="sentence-transformers/all-MiniLM-L6-v2"):
        if SentenceTransformer is None:
            raise ImportError("sentence-transformers is not installed. Install the research extra.")
        self.model_name=model_name
        self._model=SentenceTransformer(model_name)
        dimension=getattr(self._model,"get_embedding_dimension",None) or getattr(self._model,"get_sentence_embedding_dimension",None)
        self.dim=int(dimension());self.name=f"st:{model_name}"
    def encode(self,text):return np.asarray(self._model.encode([text],normalize_embeddings=True)[0],dtype=np.float32)
    def encode_batch(self,texts):return np.asarray(self._model.encode(texts,normalize_embeddings=True,show_progress_bar=False),dtype=np.float32)

def get_encoder(kind="hashing",**kwargs):
    if kind in {"hashing","demo","hashing-384"}:
        return HashingTextEncoder(**{k:v for k,v in kwargs.items() if k in {"dim","seed"}})
    if kind in {"sentence-transformers","st","minilm"}:
        return SentenceTransformerEncoder(model_name=kwargs.get("model_name","sentence-transformers/all-MiniLM-L6-v2"))
    raise ValueError(f"Unknown encoder: {kind}")

def resolve_encoder_kind(preferred=None):
    kind=(preferred or os.getenv("LEGALFLY_ENCODER") or "minilm").strip().lower()
    return "minilm" if kind in {"auto","research"} else kind
