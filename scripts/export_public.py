"""Publish genuine recorded outputs and compact research downloads."""
from pathlib import Path
import gzip
import json
from datetime import datetime, timezone
from apps.api.app.services.models import get_model_service
ROOT=Path(__file__).resolve().parents[1]

def main():
    public=ROOT/'apps/web/public/research';public.mkdir(parents=True,exist_ok=True)
    service=get_model_service();service.startup()
    text='Please email the draft to alex@example.com'
    result=service.classify_twin(text)
    for key in ('tissue','twin'):
        sim=result[key]['simulation']
        sim.pop('positions',None)
        sim['trajectory']=[[round(x,6) for x in frame] for frame in sim['trajectory']]
        sim['final_activity']=[round(x,6) for x in sim['final_activity']]
        sim['edges']=[[a,b,round(w,6)] for a,b,w in sim['edges']]
    payload={'text':text,'recorded_at':datetime.now(timezone.utc).isoformat(),'result':result}
    (public/'specimen.json').write_text(json.dumps(payload,separators=(',',':'))+'\n')
    (ROOT/'deploy/results').mkdir(parents=True,exist_ok=True)
    for source,name in [('comparison_v2.json','comparison_v2.json'),('ablation_latest.json','ablation_v2.json')]:
        obj=json.loads((ROOT/'results'/source).read_text())
        content=json.dumps(obj,separators=(',',':'))+'\n'
        (public/name).write_text(content)
        (ROOT/'deploy/results'/source).write_text(content)
    selection=ROOT/'results/comparison_v2_selection.json'
    (public/'comparison_v2_selection.json.gz').write_bytes(gzip.compress(selection.read_bytes(),mtime=0))
    print('Exported real outputs:',public)
    print('Encoder:',result['tissue']['encoder_name'])
    print('Flags:',{k:result[k]['contains_sensitive'] for k in ('tissue','twin','baseline')})

if __name__=='__main__':main()
