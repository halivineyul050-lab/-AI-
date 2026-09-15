# LaMa

Source: https://github.com/advimman/lama (Apache-2.0; LICENSE alongside this file).
CPU inference uses a TorchScript conversion distributed by IOPaint's model repository:
https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt

Verified model SHA256: `344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`
Upstream IOPaint published MD5: `e3aa4aaa15225a33ec84f9f4bc47e500`.
Model is installed separately on the server, not distributed in browser assets.
Our preprocessing/compositing code is independent; inference follows the documented RGB image and binary mask interface.
