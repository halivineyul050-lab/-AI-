"""Bounded CPU image tools. Model sources are documented in assets/vendor/image-tools."""
import argparse
import sys
import numpy as np
from PIL import Image


def validate_dimensions(size, mode):
    if mode not in ('background', 'enhance'):
        raise ValueError('处理类型无效。')
    limit = 2048 if mode == 'background' else 512
    if min(size) < 16 or max(size) > limit:
        raise ValueError(f'图片短边至少 16px，最长边不能超过 {limit}px。')


def remove_background(image, infer):
    validate_dimensions(image.size, 'background')
    rgba = image.convert('RGBA')
    rgb = rgba.convert('RGB').resize((320, 320), Image.Resampling.LANCZOS)
    values = np.asarray(rgb, dtype=np.float32)
    values /= max(float(values.max()), 1e-6)
    values = (values - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
    prediction = np.asarray(infer(values.transpose(2, 0, 1)[None]), dtype=np.float32)[0, 0]
    if not np.isfinite(prediction).all():
        raise ValueError('模型输出无效，请换一张图片重试。')
    low, high = float(prediction.min()), float(prediction.max())
    if high - low > 1e-6:
        prediction = (prediction - low) / (high - low)
    mask = Image.fromarray(np.rint(np.clip(prediction, 0, 1) * 255).astype(np.uint8)).resize(image.size, Image.Resampling.LANCZOS)
    alpha = np.asarray(rgba.getchannel('A'), dtype=np.float32) * np.asarray(mask, dtype=np.float32) / 255
    rgba.putalpha(Image.fromarray(np.rint(alpha).astype(np.uint8)))
    return rgba


def enhance(image, infer):
    validate_dimensions(image.size, 'enhance')
    rgba = image.convert('RGBA')
    y, cb, cr = rgba.convert('RGB').convert('YCbCr').split()
    values = np.asarray(y, dtype=np.float32) / 255
    width, height = image.size
    result = np.zeros((height * 3, width * 3), dtype=np.float32)
    # Fixed 224px inputs also support models with a static input shape.
    # Discard contextual borders so adjacent tiles do not introduce seams.
    padded = np.pad(values, ((16, 224), (16, 224)), mode='edge')
    for top in range(0, height, 192):
        for left in range(0, width, 192):
            tile = padded[top:top + 224, left:left + 224][None, None]
            output = np.asarray(infer(tile), dtype=np.float32)
            if output.shape != (1, 1, 672, 672) or not np.isfinite(output).all():
                raise ValueError('模型输出无效，请换一张图片重试。')
            h, w = min(192, height - top) * 3, min(192, width - left) * 3
            result[top * 3:top * 3 + h, left * 3:left * 3 + w] = output[0, 0, 48:48 + h, 48:48 + w]
    size = (width * 3, height * 3)
    luminance = Image.fromarray(np.rint(np.clip(result, 0, 1) * 255).astype(np.uint8))
    output = Image.merge('YCbCr', (luminance, cb.resize(size, Image.Resampling.BICUBIC), cr.resize(size, Image.Resampling.BICUBIC))).convert('RGBA')
    output.putalpha(rgba.getchannel('A').resize(size, Image.Resampling.LANCZOS))
    return output


def main():
    parser = argparse.ArgumentParser()
    for name in ('image', 'output', 'mode', 'model'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    with Image.open(args.image) as source:
        validate_dimensions(source.size, args.mode)
        if source.format != 'PNG':
            raise ValueError('请上传有效的 PNG 图片。')
        source.load()
        image = source.convert('RGBA')
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.log_severity_level = 3
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    with open(args.model, 'rb') as model:
        session = ort.InferenceSession(model.read(), sess_options=options, providers=['CPUExecutionProvider'])
    name = session.get_inputs()[0].name
    infer = lambda values: session.run(None, {name: values})[0]
    output = remove_background(image, infer) if args.mode == 'background' else enhance(image, infer)
    output.save(args.output, format='PNG')


if __name__ == '__main__':
    try:
        main()
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(2)
    except Exception:
        print('图片处理失败，请换一张图片重试。', file=sys.stderr)
        sys.exit(1)
