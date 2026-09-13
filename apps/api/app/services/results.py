"""Only corrected, versioned artifacts qualify as current results."""
import json
from apps.api.app.config import get_settings
from research.graphs.connectome import SCIENCE_VERSION

def _results_dir():
    settings=get_settings()
    return settings.repo_root/settings.legalfly_results_dir

def load_benchmark():
    path=_results_dir()/"comparison_v2.json"
    if path.exists():
        data=json.loads(path.read_text())
        if data.get("science_version")==SCIENCE_VERSION:return data
    return {"status":"not_yet_measured","models":{},"science_version":SCIENCE_VERSION,
            "interpretation":"Earlier results used reversed propagation and imperfect controls. They are archived, not evidence for the corrected model. Corrected results are not published here yet."}

def load_ablations():
    path=_results_dir()/"ablation_latest.json"
    if path.exists():
        data=json.loads(path.read_text())
        if data.get("science_version")==SCIENCE_VERSION:return data
    return {"status":"not_yet_measured","ablations":[],"note":"Run python -m research.experiments.surgery to produce corrected lesions."}

def list_experiments():
    items=[]
    for path in sorted(_results_dir().glob("experiment_*/result.json")):
        data=json.loads(path.read_text())
        items.append({"path":str(path.relative_to(_results_dir())),"model_type":data.get("model_type"),"seed":data.get("seed"),
                      "macro_f1":data.get("metrics_test",{}).get("macro_f1"),"timestamp":data.get("timestamp")})
    return items
