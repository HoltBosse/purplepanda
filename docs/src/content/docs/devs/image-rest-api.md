---
title: Image Rest API
description: params to pass image api
---

* fmt: "jpeg", "png", "webp", "avif"
* q: int, 0-100 for quality, helps with size
* w/h: int, recommended to use one or the other. of note transformed after x1/y1/x2/y2
* x1/y1/x2/y2: int, crops the image to this size. if any are missing image defaults are used. x2/y2 support negative numbers to add to image dimensions