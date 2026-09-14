import importlib.util, pathlib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('prepare',ROOT/'scripts'/'prepare_data.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class Selection(unittest.TestCase):
    def test_all_classified_neurons_including_orphans(self):
        rows=[{'bodyId':2,'superclass':'vnc_intrinsic','status':'Orphan'},{'bodyId':1,'superclass':'cb_intrinsic','status':'Traced'},{'bodyId':3,'superclass':None,'status':'Glia'}]
        self.assertEqual([r['bodyId'] for r in p.select_neurons(rows)],[1,2])
    def test_duplicate_ids_rejected(self):
        with self.assertRaises(ValueError):p.select_neurons([{'bodyId':1,'superclass':'cb_intrinsic'}]*2)
