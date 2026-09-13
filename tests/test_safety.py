from fastapi import FastAPI
from fastapi.testclient import TestClient
from apps.api.app.middleware.limits import RequestLimits
import pytest

def test_body_and_rate_limits_before_inference():
    app=FastAPI();app.add_middleware(RequestLimits,per_minute=2,max_bytes=128)
    @app.post('/check')
    def check():return {'ok':True}
    client=TestClient(app)
    assert client.post('/check',content=b'x'*129).status_code==413
    assert client.post('/check',content=b'x').status_code==200
    blocked=client.post('/check',content=b'x')
    assert blocked.status_code==429 and blocked.headers['retry-after']=='60'

def test_validation_errors_do_not_echo_private_text():
    from apps.api.app.main import create_app
    client=TestClient(create_app());secret='private-example-'*400
    response=client.post('/classify',json={'text':secret})
    assert response.status_code==422
    assert secret not in response.text and 'private-example' not in response.text

def test_production_refuses_missing_checkpoints(tmp_path):
    from apps.api.app.config import Settings
    from apps.api.app.services.models import ModelService
    service=ModelService(Settings(legalfly_allow_auto_train=False,legalfly_models_dir=str(tmp_path),legalfly_encoder='hashing'))
    with pytest.raises(RuntimeError,match='runtime training is disabled'):service.get_bundle('linear')

def test_checkpoint_hash_rejects_tampering(tmp_path):
    from research.experiments.pipeline import build_model,train_bundle,save_bundle,maybe_load_trained
    b=build_model('linear',encoder_kind='hashing');train_bundle(b,['hello','email a@example.com'],[['NONE'],['EMAIL']])
    save_bundle(b,tmp_path/'linear')
    with (tmp_path/'linear/readout.joblib').open('ab') as handle:handle.write(b'corrupt')
    with pytest.raises(ValueError):maybe_load_trained(build_model('linear',encoder_kind='hashing'),models_dir=tmp_path)
