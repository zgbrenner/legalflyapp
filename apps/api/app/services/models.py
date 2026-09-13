"""Verified, versioned inference. Mutable reservoirs are serialized across requests."""
from __future__ import annotations
import logging
from functools import lru_cache
from threading import RLock
from apps.api.app.config import Settings, get_settings
from research.datasets.sensitive import load_sensitive_split
from research.experiments.pipeline import build_model, maybe_load_trained, predict_bundle, train_bundle, save_bundle
from research.experiments.run import ensure_data
logger = logging.getLogger("legalfly.api")
MODEL_ALIASES = {"connectome":"connectome","biological":"connectome","real":"connectome","fly":"connectome",
                 "random":"random_erdos","random_erdos":"random_erdos","random_degree":"random_degree_preserving",
                 "random_degree_preserving":"random_degree_preserving","random_weights":"random_weights",
                 "linear":"linear","baseline":"linear","mlp":"mlp"}
class ModelService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._bundles = {}
        self._ready = False
        self._lock = RLock()
    def startup(self):
        ensure_data()
        for model in ("connectome","random_erdos","linear"):
            self.get_bundle(model)
        self._ready = True
        logger.info("ModelService ready encoder=%s", self.settings.legalfly_encoder)
    def resolve_model(self,name):
        key = name.strip().lower()
        if key not in MODEL_ALIASES:
            raise KeyError("Unknown model")
        return MODEL_ALIASES[key]
    def _feature_dim(self,bundle):
        if bundle.reservoir is not None:
            return bundle.encoder.dim + min(128,bundle.reservoir.n_nodes)*2 if bundle.config.get("feature_mode")=="hybrid" else bundle.reservoir.n_nodes*2
        return bundle.encoder.dim
    def _readout_compatible(self,bundle):
        readout=bundle.readout
        scaler=getattr(readout,"scaler",None)
        if scaler is None or not hasattr(scaler,"n_features_in_"):
            scaler=getattr(getattr(readout,"readout",None),"scaler",None)
        return scaler is not None and getattr(scaler,"n_features_in_",-1)==self._feature_dim(bundle)
    def get_bundle(self,model):
        with self._lock:
            model=self.resolve_model(model)
            if model in self._bundles:
                return self._bundles[model]
            bundle=build_model(model,encoder_kind=self.settings.legalfly_encoder,seed=self.settings.legalfly_seed,
                               feature_mode="hybrid",encoding_mode="direct",leak=.55,input_scale=2.,reservoir_weight=.1)
            models_dir=self.settings.repo_root / self.settings.legalfly_models_dir
            needs_train=True
            if (models_dir/model/"readout.joblib").exists():
                try:
                    bundle=maybe_load_trained(bundle,models_dir=models_dir)
                    needs_train=not self._readout_compatible(bundle)
                except (ValueError,OSError,KeyError):
                    needs_train=True
            if needs_train:
                if not self.settings.legalfly_allow_auto_train:
                    raise RuntimeError("Serving artifacts are missing or incompatible. Rebuild the image; runtime training is disabled.")
                train=load_sensitive_split("train")
                train_bundle(bundle,[e.text for e in train],[e.labels for e in train])
                save_bundle(bundle,models_dir/model)
            self._bundles[model]=bundle
            return bundle
    def classify(self,text,model,with_simulation=True):
        with self._lock:
            bundle=self.get_bundle(model)
            preds,sims,elapsed=predict_bundle(bundle,[text],with_simulation=with_simulation and bundle.reservoir is not None)
            pred=preds[0]
            mode=bundle.config.get("connectome_mode","none" if bundle.reservoir is None else "demo")
            graph_label=("HEMIBRAIN v1.2 · CONNECTOME SUBGRAPH" if mode=="hemibrain" else "DEMO CONNECTOME") if bundle.model_type=="connectome" else bundle.model_type.replace("_"," ").upper()
            logger.info("classify model=%s chars=%d elapsed=%.3fs",bundle.model_type,len(text),elapsed)
            return {"encoder_name":bundle.encoder.name,"science_version":bundle.config.get("science_version"),
                    "graph_hash":bundle.config.get("graph_hash"),"artifact_hash":bundle.config.get("artifact_hash"),
                    "training_examples":bundle.config.get("training_examples",0),"contains_sensitive":pred.contains_sensitive,
                    "labels":[{"name":name,"confidence":float(pred.scores.get(name,0.))} for name in pred.labels],
                    "scores":pred.scores,"model":bundle.model_type,"demo_mode":mode=="demo","connectome_mode":mode,
                    "graph_label":graph_label,"graph_source":bundle.config.get("graph_source"),
                    "anatomical_edges":bool(bundle.config.get("anatomical_edges",False)),"inference_time_sec":elapsed,
                    "simulation":sims[0] if sims else {"timesteps":0,"sampled_activity":[],"aggregate":{},"anatomical":False,"layout":"none"},
                    "disclaimer":"The Legal Fly is a trained classifier built around a fly wiring map. It is not conscious and does not provide legal advice. Text is processed on the server. Use invented or redacted examples."}
    def classify_twin(self,text,with_simulation=True):
        tissue=self.classify(text,"connectome",with_simulation)
        twin=self.classify(text,"random_erdos",with_simulation)
        baseline=self.classify(text,"linear",False)
        return {"tissue":tissue,"twin":twin,"baseline":baseline,
                "agree_on_sensitive":tissue["contains_sensitive"]==twin["contains_sensitive"],
                "disclaimer":"Same text features, different wiring. Agreement is not correctness; disagreement does not establish its cause."}
    def list_models(self):
        result=[]
        for name in ("connectome","random_erdos","random_degree_preserving","random_weights","linear","mlp"):
            bundle=self._bundles.get(name)
            result.append({"id":name,"name":name,"loaded":bundle is not None,
                           "demo_mode":bundle.config.get("demo_mode") if bundle else None,
                           "graph_source":bundle.config.get("graph_source") if bundle else None,
                           "encoder_name":bundle.encoder.name if bundle else None})
        return result
@lru_cache
def get_model_service():
    return ModelService(get_settings())
