# Image tool models and attribution

The production models are separate runtime files, not browser assets or repository blobs.

- Background: U2NetP from https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx . U-2-Net upstream https://github.com/xuebinqin/U-2-Net (Apache-2.0); normalization and output processing adapted from rembg (MIT, Copyright 2020 Daniel Gatis). Copies of both licenses accompany this notice. Our code adds bounds, constant-output handling and original-alpha preservation.
- Enhancement: https://media.githubusercontent.com/media/onnx/models/main/validated/vision/super_resolution/sub_pixel_cnn_2016/model/super-resolution-10.onnx . ONNX Model Zoo Super Resolution, Apache-2.0. We add contextual tiling, original-alpha preservation and bounded CPU execution. https://github.com/onnx/models/tree/main/validated/vision/super_resolution/sub_pixel_cnn_2016
- Runtime: onnxruntime 1.20.1 CPU on Python 3.11, Pillow and NumPy in the existing isolated image-service virtual environment. Runtime package licenses are included by pip.

Verified model SHA-256:

- `super-resolution-10.onnx`: `85f36ff88cc504a24af5e0602148bc56a8aa09a58eca8c0da2756f3e8186035e`

- `u2netp.onnx`: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`
