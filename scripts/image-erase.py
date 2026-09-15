"""CPU LaMa inference. Images are private temporary files supplied by the Node service."""
import argparse
import os
import sys
import warnings
import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = 4 * 1024 * 1024
warnings.simplefilter('error', Image.DecompressionBombWarning)


def repair(image, mask, infer):
    if image.size != mask.size:
        raise ValueError('选区尺寸与图片不一致，请重新选择。')
    w, h = image.size
    if min(w, h) < 16 or max(w, h) > 2048 or w * h > 4 * 1024 * 1024:
        raise ValueError('图片尺寸需在 16 至 2048 像素之间。')
    binary = np.array(mask.convert('L')) > 127
    coverage = float(binary.mean())
    if coverage == 0:
        raise ValueError('请先涂抹需要消除的区域。')
    if coverage >= 0.85:
        raise ValueError('选区过大，请保留更多背景，分几次消除。')
    ys, xs = np.where(binary)
    bounds = (max(0, int(xs.min()) - 96), max(0, int(ys.min()) - 96),
              min(w, int(xs.max()) + 97), min(h, int(ys.max()) + 97))
    rgb = image.convert('RGB')
    region = rgb.crop(bounds)
    selected = Image.fromarray(binary.astype(np.uint8) * 255)
    # Give the model room around the selection, but composite only selected pixels.
    model_mask = selected.filter(ImageFilter.MaxFilter(9)).crop(bounds)
    original_size = region.size
    scale = min(1, 512 / max(original_size))
    size = (max(16, round(original_size[0] * scale)), max(16, round(original_size[1] * scale)))
    region = region.resize(size, Image.Resampling.LANCZOS)
    model_mask = model_mask.resize(size, Image.Resampling.NEAREST).filter(ImageFilter.MaxFilter(3))
    restored = infer(region, model_mask).resize(original_size, Image.Resampling.LANCZOS)
    result = image.copy()
    if image.mode == 'RGBA':
        restored = restored.convert('RGBA')
        restored.putalpha(image.getchannel('A').crop(bounds))
    result.paste(restored, bounds, selected.crop(bounds))
    return result


def load_inference(path):
    import torch
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    # PyTorch's Windows filename loader cannot open some non-ASCII paths.
    if os.name == 'nt' and not path.isascii():
        with open(path, 'rb') as model_file:
            model = torch.jit.load(model_file, map_location='cpu').eval()
    else:
        model = torch.jit.load(path, map_location='cpu').eval()

    def infer(image, mask):
        rgb = np.asarray(image, dtype=np.float32) / 255
        selected = (np.asarray(mask) > 0).astype(np.float32)
        h, w = selected.shape
        pad = ((0, (-h) % 8), (0, (-w) % 8))
        rgb = np.pad(rgb, (*pad, (0, 0)), mode='symmetric')
        selected = np.pad(selected, pad, mode='symmetric')
        tensor = torch.from_numpy(rgb.transpose(2, 0, 1).copy()).unsqueeze(0)
        selection = torch.from_numpy(selected.copy()).unsqueeze(0).unsqueeze(0)
        with torch.inference_mode():
            result = model(tensor, selection)[0].permute(1, 2, 0).cpu().numpy()
        return Image.fromarray(np.clip(result[:h, :w] * 255, 0, 255).astype(np.uint8))
    return infer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    parser.add_argument('--mask', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--model', required=True)
    args = parser.parse_args()
    try:
        with Image.open(args.image) as source, Image.open(args.mask) as selection:
            if source.format != 'PNG' or selection.format != 'PNG':
                raise ValueError('请使用有效的 PNG 图片与选区。')
            image = source.convert('RGBA' if 'A' in source.getbands() or 'transparency' in source.info else 'RGB')
            mask = selection.convert('L')
        # Validate before loading the model, to avoid allocating inference memory for bad inputs.
        inference = None
        def lazy_infer(i, m):
            nonlocal inference
            inference = load_inference(args.model)
            return inference(i, m)
        repair(image, mask, lazy_infer).save(args.output, format='PNG')
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    except Exception:
        print('图片处理失败，请尝试较小的图片或重新绘制选区。', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
