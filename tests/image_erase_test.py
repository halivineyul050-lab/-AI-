import importlib.util
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch
import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('eraser', Path(__file__).parents[1] / 'scripts/image-erase.py')
eraser = importlib.util.module_from_spec(spec)
spec.loader.exec_module(eraser)

class RepairTests(unittest.TestCase):
    def test_png_palette_transparency_survives_cli(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = Image.new('P', (64, 64), 0)
            image.putpalette([10, 20, 30, 90, 100, 110] + [0] * 762)
            image.save(root / 'image.png', transparency=0)
            mask = Image.new('L', image.size)
            mask.paste(255, (20, 20, 30, 30))
            mask.save(root / 'mask.png')
            argv=['erase','--image',str(root/'image.png'),'--mask',str(root/'mask.png'),'--output',str(root/'out.png'),'--model','unused']
            with patch('sys.argv', argv), patch.object(eraser, 'load_inference', return_value=lambda i,m:i):
                self.assertEqual(eraser.main(), 0)
            with Image.open(root/'out.png') as result:
                self.assertEqual(result.getpixel((0,0)), (10,20,30,0))

    def test_composite_preserves_unselected_pixels_and_alpha(self):
        rng = np.random.default_rng(12)
        pixels = rng.integers(0, 256, (128, 160, 4), dtype=np.uint8)
        mask = np.zeros((128, 160), dtype=np.uint8)
        mask[40:70, 50:80] = 255
        def infer(image, selection):
            self.assertLessEqual(max(image.size), 512)
            return Image.new('RGB', image.size, (20, 60, 90))
        result = np.array(eraser.repair(Image.fromarray(pixels), Image.fromarray(mask), infer))
        np.testing.assert_array_equal(result[mask == 0], pixels[mask == 0])
        np.testing.assert_array_equal(result[:, :, 3], pixels[:, :, 3])
        self.assertTrue(np.any(result[mask > 0, :3] != pixels[mask > 0, :3]))

    def test_rejects_empty_full_and_wrong_size_mask(self):
        image = Image.new('RGB', (64, 64))
        for mask in [Image.new('L', (64, 64)), Image.new('L', (64, 64), 255), Image.new('L', (32, 64))]:
            with self.assertRaises(ValueError):
                eraser.repair(image, mask, lambda a, b: a)

    def test_large_image_keeps_dimensions_but_bounds_inference(self):
        image = Image.new('RGB', (1600, 1000), (90, 70, 20))
        mask = Image.new('L', image.size)
        mask.paste(255, (400, 200, 1200, 800))
        def infer(i, m):
            self.assertLessEqual(max(i.size), 512)
            self.assertEqual(i.size, m.size)
            return Image.new('RGB', i.size, (10, 40, 80))
        self.assertEqual(eraser.repair(image, mask, infer).size, image.size)

if __name__ == '__main__': unittest.main()
