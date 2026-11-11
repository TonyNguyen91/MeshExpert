# MrT MeshExpert

Công cụ chỉnh sửa mesh STL/OBJ chạy offline trong trình duyệt. Mở trực tiếp `index.html` (Chrome/Edge), không cần cài đặt.

## Cấu trúc
- `index.html` — file ứng dụng hoàn chỉnh (bản phát hành).
- `src/head.html` — giao diện (HTML/CSS).
- `src/core_base.js`, `src/core_extra.js` — lõi xử lý mesh (đọc/ghi, decimate, tách body, undercut, va chạm, đo, ICP...).
- `src/app2.js` — logic giao diện và thao tác.
- `src/build.py` — ghép các file trên thành `index.html`: `python3 src/build.py`.
- `src/test_core.js`, `src/test_cmp.js` — kiểm thử lõi bằng Node.js.
- `tests/ui*.py` — kiểm thử giao diện tự động bằng Playwright + Chrome.

## Ghi chú
- `src/core.js` được sinh tự động khi chạy `build.py`.
- `app.js` cũ đã được thay bằng `app2.js` và không còn dùng.
