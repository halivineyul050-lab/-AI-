import importlib.util
from pathlib import Path
import unittest
import numpy as np
from PIL import Image
spec=importlib.util.spec_from_file_location('image_tools',Path(__file__).parents[1]/'scripts/image-tools.py')
tools=importlib.util.module_from_spec(spec);spec.loader.exec_module(tools)

class Tests(unittest.TestCase):
    def test_background_preserves_rgb_and_existing_alpha(self):
        image=Image.new('RGBA',(64,40),(120,60,30,128))
        result=tools.remove_background(image,lambda x:np.ones((1,1,320,320),dtype=np.float32)*0.5)
        self.assertEqual(result.size,image.size)
        self.assertEqual(result.getpixel((20,20)),(120,60,30,64))
    def test_background_black_image_and_constant_prediction_are_finite(self):
        def infer(x):
            self.assertTrue(np.isfinite(x).all())
            return np.zeros((1,1,320,320),dtype=np.float32)
        self.assertEqual(tools.remove_background(Image.new('RGB',(32,32)),infer).getextrema()[3],(0,0))
    def test_upscale_tiles_keep_shape_color_and_alpha(self):
        image=Image.new('RGBA',(251,177),(90,130,170,128))
        def infer(x):
            self.assertEqual(x.shape,(1,1,224,224))
            return np.repeat(np.repeat(x,3,2),3,3)
        output=tools.enhance(image,infer)
        self.assertEqual(output.size,(753,531))
        self.assertEqual(output.getextrema()[3],(128,128))
        self.assertLess(max(abs(a-b) for a,b in zip(output.getpixel((200,200))[:3],(90,130,170))),3)
    def test_dimension_guard(self):
        for mode,size in [('enhance',(513,100)),('background',(2049,100)),('background',(15,100))]:
            with self.assertRaises(ValueError):tools.validate_dimensions(size,mode)

if __name__=='__main__':unittest.main()
