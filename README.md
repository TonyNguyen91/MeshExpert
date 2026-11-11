# MrT MeshExpert

Công cụ chỉnh sửa mesh STL/OBJ chạy offline trong trình duyệt. Mở trực tiếp `index.html` (Chrome/Edge), không cần cài đặt.

## Cấu trúc
- `index.html` — file ứng dụng hoàn chỉnh (bản phát hành).
- `src/head.html` — giao diện (HTML/CSS).
- `src/core_base.js`, `src/core_extra.js` — lõi xử lý mesh (đọc/ghi, decimate, tách body, undercut, va chạm, đo, ICP...).
- `src/app2.js` — logic giao diện và thao tác.
- `src/build.py` — ghép các file trên thành `index.html`: `python3 src/build.py`.
- `src/test_core.js`, `src/test_cmp.js`, `src/test_split.js`, `src/test_repair.js` — kiểm thử lõi bằng Node.js (chạy `build.py` trước).
- `tests/ui*.py` — kiểm thử giao diện tự động bằng Playwright + Chrome.
- `tests/make_split_meshes.js` — tạo các file STL mẫu cho `tests/ui5.py`, `tests/ui6.py`, `tests/ui7.py`.

## Tách body: các phương án
"Tách body" bắt đầu từ phương án 1; "Phương án kế ▶", "◀ Phương án trước" hoặc thanh trượt làm lại đúng lần tách đó với phương án khác.
1. Các mảnh rời nhau (không chung đỉnh).
2. Tách cả chỗ chỉ chạm nhau tại 1 điểm.
3. Tách cả chỗ chạm nhau theo cạnh hoặc mặt (mỗi vỏ kín thành 1 body).
4. – 7. Cắt thêm tại khe lõm gấp từ 70°, 50°, 35°, 22° (chỗ các phần dính liền nhau); mảnh hở tại đường cắt.
8. – 10. Cắt tại mọi cạnh gấp từ 60°, 35°, 20° (tách thành từng mặt).

## Ghi chú
- `src/core.js` được sinh tự động khi chạy `build.py`.
- `app.js` cũ đã được thay bằng `app2.js` và không còn dùng.

## Thao tác trên màn hình 3D
- Bấm lần lượt vào các body để tick thêm, bấm lại để bỏ tick; bấm khoảng trống hoặc nhấn Space để bỏ chọn hết.
- Giữ chuột phải kéo: xoay hướng nhìn quanh đúng điểm vừa bấm trên mesh.
- Công cụ Xoay: kéo mũi tên cong cùng màu với trục để xoay quanh trục đó; giữ Shift để xoay theo bước 1°.
- Bảng "Thông tin": ô tick ở dòng "Kích thước bao" hiện hộp bao kèm 3 kích thước; ô tick ở dòng "Trọng tâm" hiện trọng tâm, các công cụ đo bắt được điểm này.

## Vá lưới hở và đo theo hình dạng
- Viền hở của mọi mesh được vẽ màu đỏ sáng (ô "Viền hở" ở hàng Hiển thị).
- Mục "Vá lưới hở": 3 kiểu vá (phẳng; chia lưới đều; chia lưới và uốn theo mặt cong xung quanh), giới hạn chu vi lỗ, khâu khe hở.
- Công cụ đo tự nhận mặt phẳng, mặt trụ, mặt cầu, cạnh thẳng, cung tròn và đỉnh: bấm 1 cạnh để lấy chiều dài, 1 cung / mặt trụ / mặt cầu để lấy R, 2 đối tượng để đo khoảng cách hoặc góc. Giữ Alt để lấy điểm tự do.
