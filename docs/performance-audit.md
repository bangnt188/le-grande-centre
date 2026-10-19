# Báo cáo điểm nghẽn hiệu năng — Le Grande Centre

**Thời điểm đo:** 11/10/2026, UTC.  
**Phạm vi:** homepage v2, catalogue mặt bằng, popup xem ảnh và viewer 3D.  
**Trạng thái:** baseline và kiểm chứng trước/sau ở dưới là lịch sử. Ngày 13/10/2026, route 3D đã gỡ khỏi website theo yêu cầu khách hàng; source/harness chuyển sang https://github.com/bangnt188/3d-model-mall. Các đường dẫn viewer/script trong báo cáo được hiểu tương đối trong repo 3D mới, không phải file còn chạy trong website. Các phần homepage/catalogue ngoài viewer chưa thay đổi.

> Kiến trúc website và checkout đã tiếp tục thay đổi sau các phép đo này: hiện dùng Next standalone/OpenNext Worker. Lệnh preview static và host/cache references bên dưới là của lần đo 11/10, không phải hướng dẫn chạy hoặc bằng chứng runtime hiện tại.

## 1. Kết luận để báo cáo

1. **Viewer 3D có nghẽn lúc khởi tạo.** Production ghi nhận các main-thread long task 67, 160 và 197ms. CPU profile của một lượt reload khác chỉ ra công việc render/khởi tạo shader, đặc biệt `getProgramInfoLog`, là hot path. Đây là bằng chứng trực tiếp về gián đoạn phản hồi khi vào 3D; chưa phải bằng chứng tất cả thời gian lag của toàn website đều do 3D.
2. **Cảm giác cuộn chậm có một nguyên nhân riêng: easing của Lenis.** Với một wheel input 300px, chế độ hiện tại mới đi được 207px sau 200ms và 294px sau khoảng 700ms; native wheel đạt 300px sau 18ms. Đây là độ trễ thiết kế, không đồng nghĩa rớt FPS.
3. **Lớp mây blur toàn trang làm tăng chi phí compositing.** Đối chứng foreground, warm-cache, ẩn riêng plume giảm tổng GPU-task time khoảng 22%. Frame time không cải thiện trong phép đo này; chưa đủ bằng chứng gọi plume là nguyên nhân chính gây giật trên M1 Pro.
4. **Không quan sát được giật kéo dài ở lượt cuộn homepage warm-cache, catalogue hoặc thao tác zoom/đổi ảnh trong các kịch bản đã chạy.** Homepage foreground vẫn không có main-thread long task khi giả lập CPU chậm 4 lần. Điều này không phủ nhận hiện tượng người dùng báo trên thiết bị khác hoặc khi tải lần đầu.

**Ưu tiên xử lý:** shader/khởi tạo và tải scene 3D → độ trễ wheel easing → lớp blur lớn và kích thước ảnh. Không cần viết lại kiến trúc hoặc bỏ hiệu ứng tách tầng để xử lý các điểm này.

## 2. Điều kiện và phương pháp

- Bản production: `npm run build` thành công; phục vụ static export bằng Vite preview tại `http://127.0.0.1:3199/le-grande-center/`.
- Máy đo: macOS arm64, Apple M1 Pro; Chromium headless, ANGLE/Metal, GPU acceleration hoạt động.
- Viewport chính: 1366 × 900 CSS px, DPR 1. CPU mặc định và CPU throttling 4× qua Chrome DevTools Protocol.
- Thao tác: wheel thực qua browser, mở modal bằng nút giao diện, nhấn zoom +/− và ArrowRight, chọn quality và bật/tắt chuyển động bằng controls thật.
- Thu thập: rAF intervals, `PerformanceObserver` long tasks, browser CPU profile, timeline trace, resource timing và renderer stats có sẵn.
- A/B không đổi source: chỉ tạm ẩn `[data-ui-cloud-plume]` hoặc thêm `data-lenis-prevent-wheel` lên `#main-content`. Geometry, controller cuộn, reveal và hiệu ứng tách tầng vẫn giữ nguyên. Các thay đổi DOM không được lưu vào repo.
- Đối chứng có bước chờ easing kết thúc, đưa trang về đầu và xác nhận `scrollY = 0` trước mỗi lượt.
- Đã dùng trang trắng làm control. Đợt đầu có rAF khoảng 33ms ở cả trang trắng; sau đưa tab lên foreground, homepage đạt khoảng 16,7ms. Vì vậy **không dùng mốc 33ms của đợt đầu để kết luận app bị khóa 30 FPS**.
- Thống kê draw calls/triangles lấy từ dev runtime vì production không xuất `canvas.dataset.sceneStats`. Chỉ dùng chúng để mô tả tải render; không so tốc độ dev với production.

## 3. Kết quả chi tiết

### 3.1 Homepage: warm-cache không nghẽn JavaScript kéo dài

Lượt foreground, 50 wheel input × 200px, CPU 4×; cuộn tới cuối trang ở `scrollY = 8668`.

| Chỉ số | Kết quả |
|---|---:|
| rAF p50 / p95 | 16,7 / 16,7ms |
| rAF lớn nhất | 33,3ms |
| Khoảng rAF trên 50ms | 0 |
| Main-thread long task | 0 |
| Tổng ScriptDuration trong lượt đo | 105,0ms |
| Tổng LayoutDuration | 12,1ms |
| Tổng RecalcStyleDuration | 47,1ms |

Lượt cuộn đầu của phiên profiling ghi nhận khoảng rAF lớn nhất 233,3ms. Trace cùng lượt có GPU task dài 270,3ms và image decode task dài 51,8ms; lượt warm sau đó không lặp lại hitch lớn. **Đã xác định vấn đề cold rendering, nhưng chưa cô lập được ảnh, iframe hay shader/compositing nào tạo chính xác hitch này.** Không được dùng tương quan này để quy toàn bộ lỗi cho ảnh hoặc GSAP.

### 3.2 Wheel smoothing: đáp ứng chậm là có thật

Nguồn: `packages/ui/src/motion/scroll-motion.tsx:20–27`, Lenis `lerp: 0.09`, `smoothWheel: true`.

Một wheel input 300px, cùng vị trí bắt đầu; chỉ bypass smoothing ở lượt native:

| Chế độ | Kết quả quan sát |
|---|---|
| Lenis hiện tại | 89px tại 49ms; 207px tại 200ms; 282px tại 499ms; 294px tại 699ms |
| Native wheel | Đạt 300px tại 18ms; giữ nguyên tới hết cửa sổ đo |

**Diễn giải:** phản hồi ban đầu vẫn có, nhưng quãng đường cuộn kéo dài gần một giây. Người dùng có thể cảm nhận như web bị ì dù không có long task.

**Đề xuất:** tăng `lerp` và kiểm tra cảm giác trên trackpad/mouse; hoặc dùng native wheel nếu yêu cầu thiết kế cho phép. Giữ GSAP/ScrollTrigger và timeline tách tầng. Không cần thêm một controller cuộn thứ hai.

### 3.3 Lớp mây toàn trang: chi phí GPU, chưa chứng minh giật kéo dài

Nguồn:
- `packages/ui/src/components/layout/layered-scroll-story.module.css:24–67`: atmosphere phủ toàn surface; plume overscan `-12% -20%`, bốn radial gradient, `blur(34px)`, `will-change: transform`.
- `packages/ui/src/components/layout/layered-scroll-story.tsx:40–63`: scrub translation/rotation của plume và opacity của veil.
- `src/features/public/homepage-v2-interactive.tsx:18–21`: homepage bật clouds mặc định; không có cloud background image.

Box plume đo thực tế khoảng **1912 × 10335 CSS px** trên surface cao 8334px. Đây là kích thước DOM của vùng hiệu ứng, **không phải phép đo lượng VRAM cấp phát**; trình duyệt có thể tiling/culling.

Đối chứng foreground, cùng assets warm-cache, CPU 1×, 40 wheel input × 220px:

| Chỉ số | Plume bật | Chỉ plume ẩn |
|---|---:|---:|
| Tổng GPU-task duration trong trace | 89,3ms | 69,5ms |
| rAF p95 | 16,7ms | 16,7ms |
| rAF lớn nhất | 16,8ms | 16,8ms |
| Main-thread long task | 0 | 0 |
| Tổng ScriptDuration | 56,0ms | 57,5ms |

Ẩn plume giảm khoảng **22% GPU-task duration**, nhưng không giảm frame interval. Hai lượt có thời lượng hơi khác nhau do wheel scheduling; đây là đối chứng đơn, không phải benchmark nhiều mẫu.

**Đề xuất:** giới hạn vùng gradient/blur theo viewport hoặc từng chapter; giảm overscan/blur ở mobile. Giữ hiệu ứng mây nhưng tránh một filtered surface cao hơn 10.000px.

### 3.4 Viewer 3D: cold-start là điểm nghẽn rõ nhất

Production cold-start ở CPU 1× ghi nhận long tasks **67, 160 và 197ms** trong giây đầu. Một CPU profile reload độc lập, dài 3,10 giây, có khoảng 0,96 giây on-CPU:

| Hot path / self time | Kết quả |
|---|---:|
| `getProgramInfoLog` self time | 298,6ms; 31% on-CPU |
| `texSubImage2D` self time | 24,7ms |
| `shaderSource` self time | 12,2ms |
| `getShaderInfoLog` self time | 10,0ms |

Các giá trị là tổng sampled time trong cửa sổ profile, **không phải một lần gọi hoặc GPU execution time**. Hot path nằm trong Three.js render → program/uniform initialization. Tìm trong `src/app/model-3d` chưa có lời gọi `compileAsync`/`compile` chủ động.

Nguồn cần xử lý:
- `src/app/model-3d/runtime.ts:35–61,105–133,204–211`: khởi tạo pipeline; render/shadow động; landscape loads sau readiness.
- `src/app/model-3d/rendering.ts:13–25,45–49,107–131`: DPR, MSAA, shadow map và GTAO theo tier. High/medium dùng GTAO; auto dựa vào cores/memory/số pixel, chưa benchmark GPU thực.
- `src/app/model-3d/assets.ts:11–31`: gom chunk, tạo buffer, kiểm checksum rồi parse GLTF.

Resource timing của một lần tải production ghi nhận **9.484.081 bytes (~9,48MB)** cho building + HDR + sáu landscape assets. Các asset lớn nhất là building ~3,22MB, tree ~2,96MB và vehicle ~2,11MB. Thời gian tải localhost không đại diện cho mạng thật.

Renderer stats hiện có, cùng viewport và camera mặc định, hai snapshot dev:

| Chỉ số | High | Low |
|---|---:|---:|
| Draw calls của frame được lấy mẫu | 197 | 151 |
| Triangles submitted của frame | 7.930.731 | 2.878.920 |
| GLTF parse/decode elapsed, tree | 114,3ms | 39,5ms |
| GLTF parse/decode elapsed, vehicle | 108,9ms | 61,3ms |

Triangles cộng các render/shadow/composer passes, không phải số tam giác duy nhất của model. Frame đang cập nhật shadow và frame khác có thể khác nhau. Parse/decode là elapsed time có sẵn trong source, không chứng minh toàn bộ khoảng đó block main thread. Low là thay đổi nhiều thông số và cadence cùng lúc; không dùng bảng này để kết luận riêng GTAO tạo ra toàn bộ chênh lệch.

Production foreground, high tier, đo idle khoảng hai giây với cùng camera:

| Chỉ số | Chuyển động bật | Chuyển động tắt |
|---|---:|---:|
| Tổng ScriptDuration | 118,8ms | 3,1ms |
| Tổng TaskDuration | 170,5ms | 53,8ms |
| rAF p95 / max | 16,8 / 16,8ms | 16,8 / 16,8ms |
| Khoảng rAF trên 50ms | 0 | 0 |

Dừng chuyển động giảm khoảng **97% ScriptDuration** trong cửa sổ này. Đó là chi phí thường trực của scene động, không phải bằng chứng render liên tục đang giật trên M1 Pro. Runtime đã có visibility/reduced-motion guards và render-on-demand khi motion off; không cần thêm vòng RAF mới.

**Đề xuất:**
1. Ưu tiên shader warm-up/`compileAsync` ở giai đoạn loading nếu hỗ trợ; cần xử lý cả shader của composer, không chỉ scene chính. Mục tiêu là tránh synchronous shader work khi người dùng đã bắt đầu tương tác, không đơn thuần che bằng loading lâu hơn.
2. Đo/tối ưu tree, vehicle và shadow passes trước khi đổi kiến trúc; chọn quality thấp hơn trên thiết bị yếu sau khi đo thực.
3. Tránh remount/tải lại toàn scene khi đổi quality nếu bước đó tiếp tục tạo hitch. Hiện `src/app/model-3d/viewer.tsx:88–99` remount runtime theo selection.
4. Giữ công tắc chuyển động hiện có; đánh giá cadence shadow và số đối tượng động trên mobile. Không tự bỏ xe/người nếu chưa được duyệt.

### 3.5 Catalogue và popup ảnh: chưa có bằng chứng là nút thắt

- Catalogue: lượt cuộn ở CPU 4× không có long task hoặc khoảng rAF trên 50ms; ScriptDuration khoảng 22,0ms.
- Popup ảnh của `/mat-bang/A.1/`: đã mở bằng control thật; phóng to bốn lần, thu nhỏ hai lần, ArrowRight năm lần. CPU 4×: ScriptDuration 38,7ms, LayoutDuration 8,3ms; không có long task hoặc khoảng rAF trên 50ms trong lượt thao tác.
- Chưa đo pinch-zoom trên điện thoại, kéo ảnh độ phân giải cao hoặc nhiều modal liên tiếp. Không kết luận component ảnh hoàn hảo; chỉ chưa có cơ sở ưu tiên viết lại nó.

### 3.6 Ảnh homepage: dư pixel ở một số vị trí

| Asset | Độ phân giải | Một số kích thước hiển thị desktop | Encoded body quan sát |
|---|---|---|---:|
| Aerial context | 2400 × 1350 | 566 × 318; thumbnail 379 × 152; ảnh lớn 1180 × 562 | 696.926 bytes |
| Aerial close | 2400 × 1350 | 481 × 271; thumbnail 379 × 152 | 641.426 bytes |
| Project perspective | 1400 × 788 | thumbnail 379 × 152 | 410.419 bytes |
| Facade detail | 1600 × 900 | card 277 × 205; mosaic 466 × 574 | 334.689 bytes |
| Upper detail | 1600 × 900 | card 277 × 205; mosaic 700 × 280 | 353.143 bytes |

Dùng cùng URL ở nhiều vị trí không đồng nghĩa tải network đầy đủ nhiều lần; HTTP/decoded cache có thể dùng lại. Tuy nhiên thumbnail không cần source lớn bằng ảnh mở modal.

**Đề xuất:** responsive variants/`srcset` cho thumbnail và card; giữ ảnh lớn cho overview/modal khi cần. [INFERENCE] Việc này có thể giảm cold image decode/upload và thời gian tải qua mạng yếu; chưa đo mức cải thiện sau tối ưu.

Video dự án đang `paused = true`, `preload = none` trong runtime đã kiểm tra; không có cơ sở quy lỗi cho video autoplay. Google Maps là iframe ngoài; chưa chạy đối chứng bỏ iframe, vì vậy chưa kết luận nó là thủ phạm.

## 4. Thứ tự hành động tối thiểu

| Ưu tiên | Công việc | Điều kiện chấp nhận |
|---|---|---|
| P1 | Giảm synchronous shader/init work khi vào viewer 3D | Profile cold-start trước/sau; giảm long task và hot path program initialization; giữ chất lượng đã duyệt |
| P1 | Điều chỉnh wheel easing nếu “lag” là cảm giác ì trên homepage | So wheel 300px trước/sau và kiểm tra mouse/trackpad; giữ reveal và tách tầng |
| P2 | Thu nhỏ vùng cloud blur | A/B GPU/compositor trên máy thật và mobile DPR cao; hiệu ứng không đổi ý đồ thiết kế |
| P2 | Responsive ảnh + kiểm tải scene 3D trên mạng thật | Đo transferred bytes, decode/startup và film/ảnh/modal vẫn đúng nội dung |
| P3 | Gallery hover flex-grow | Chỉ tối ưu nếu hover profile cho thấy hitch; hiện mới là nghi vấn source, chưa có phép đo riêng |

Không thêm cache framework, không thay GSAP/Lenis toàn bộ, không tách thêm module chỉ để “tối ưu kiến trúc”. Đo từng thay đổi độc lập để biết chính xác phần nào cải thiện.

## 5. Giới hạn và cách kiểm lại

- Chưa đo website trên domain triển khai/CDN, mạng 4G thật, iOS Safari hoặc Android GPU yếu. CPU throttling không mô phỏng GPU/memory/network của điện thoại.
- Dữ liệu foreground và đợt control 33ms không trộn để kết luận FPS. Các số catalogue/modal chỉ dùng xác định long task và khung hình chậm trên 50ms của kịch bản đã chạy.
- Tổng GPU-task time là timeline browser task, không phải GPU timestamp query. Nested/multi-process trace events không được cộng thành wall time của riêng ứng dụng; trace homepage có thể bao gồm iframe Maps.
- Initial cold homepage hitch chưa có đối chứng tách riêng từng ảnh/iframe. Memory leak và gallery hover chưa được đo lâu dài.
- Host Vite phục vụ static export không đại diện cấu hình routing/RSC của host production; dùng direct route cho detail. Không quy hạn chế host thử nghiệm thành lỗi hiệu năng app.
- Raw captures được tạo ở `/tmp/lg-home-baseline.cpuprofile`, `/tmp/lg-home-baseline.trace.json`, `/tmp/lg-3d-cold.cpuprofile`, `/tmp/lg-focused-plume-{on,off}.trace.json` và `/tmp/lg-image-modal.trace.json`. Đây là file tạm của máy đo, **không được đóng gói trong báo cáo/repo và không đảm bảo tồn tại sau cleanup hệ thống**. Các số quan trọng đã lưu trong báo cáo này.

**Tái kiểm sau khi sửa:** build production; dùng Chrome Performance với GPU bật, tab foreground, cùng viewport/DPR; tách cold-start và warm interaction; so từng thay đổi với cùng thao tác và cache; lặp lại trên ít nhất một điện thoại thật. Không lấy Next dev compilation/HMR làm kết quả performance production.

## 6. Cập nhật sau triển khai: cold-start và loading 3D

### Thay đổi đã giao

- `src/app/model-3d/rendering.ts`: dùng `renderer.compileAsync` cho scene và các shader AO/normal/composite, OutputPass, FXAA trước khi hiển thị. Compile scene với đúng offscreen target; không hạ tier, DPR, shadow resolution, MSAA hoặc AO samples. Post-processing chỉ chuẩn bị một lần mỗi runtime.
- Rig ánh sáng tạo environment theo preset ban đầu, bỏ lượt tạo daylight environment thừa trước preset hoàng hôn. Giữ HDR/procedural rig và ánh sáng đã duyệt.
- `src/app/model-3d/runtime.ts`: tải landscape song song nhưng serialize insertion/precompile/upload render; nhường event loop giữa các GPU batch. Chỉ báo ready sau warm-up và frame thực; đồng bộ lựa chọn tầng/góc nhìn mới nhất trước khi mở tương tác.
- `src/app/model-3d/viewer.tsx` và CSS: bỏ ảnh phủ khi loading; dùng `Loading` + `ProgressBar` sẵn có của `@mall/ui`, không thêm dependency. 0–70% là feedback chuẩn bị ước lượng khoảng 300ms; 70–100% theo các bước thực: building, lighting/HDR, sáu landscape loads/warm-ups, compilation và frame đầu. Đây là tiến độ theo bước, không phải phần trăm byte tải. Không có timer tự đưa lên 100%.
- Chặn canvas trước ready, vẫn thoát được. Error không báo hoàn tất. Reduced motion bỏ chuyển động chuẩn bị không thiết yếu; mobile không bị các nút tầng che progress.
- Không xóa `project-film-poster.webp`: file còn được homepage/phim dùng; chỉ bỏ tham chiếu ảnh trong stage 3D và CSS `.poster` đã hết dùng.

### Số đo trước/sau

Cùng production static host, Chrome mới/profile mới mỗi lượt, tab foreground, viewport 1366×900, DPR 1, CPU 1×, quality `high`, GPU-default. Profiler khởi động từ trang bootstrap rỗng cùng origin để không warm app hoặc mất renderer process. Capture khoảng 6 giây. Baseline 3 lượt; bảng sau dùng lượt release cuối có kiểm tra loading.

| Chỉ số | Baseline: 3 lượt độc lập | Bản release: 1 lượt độc lập |
|---|---:|---:|
| Long task lớn nhất bắt đầu trước ready | 179 / 210 / 187ms | 66ms |
| Sampled time trong subtree `getUniforms` | 375,8 / 415,9 / 408,1ms | 128,5ms |
| rAF gap lớn nhất, toàn cửa sổ capture | 233,3 / 250,1 / 250,0ms | 66,7ms |
| ScriptDuration, toàn cửa sổ capture | 793,0 / 824,7 / 819,7ms | 456,1ms |
| Thời điểm báo ready sau navigation | 478,5 / 544,5 / 486,7ms | 737,2ms |
| Quality | high / high / high | high |

**Đọc đúng số liệu:** bản cũ báo ready khi building có mặt, landscape còn tải phía sau. Bản mới đợi warm-up toàn scene trước khi ready. Vì vậy thời điểm ready tăng không có nghĩa scene hoàn chỉnh tải chậm hơn; hai trạng thái ready có điều kiện khác nhau. Baseline chỉ lưu long tasks trước ready, không đủ dữ liệu để so tổng long tasks toàn 6 giây; không dùng tổng đó để tuyên bố cải thiện. rAF và CPU profile trong bảng đều cover toàn cửa sổ capture.

`getUniforms` subtree gồm first-use program/uniform initialization và các descendants; là sampled CPU/wait time, không phải GPU execution time. Các lượt harness không có named native node `getProgramInfoLog`; giá trị native 0 là **chưa quan sát riêng được**, không phải zero shader wait. Program initialization vẫn còn, không tuyên bố đã hết long task. Lượt release có tổng long task toàn capture 194ms; không có exceptions/browser errors trong capture.

Ba lượt sau khi tối ưu renderer trước bước đồng bộ lựa chọn tầng cuối ghi nhận max task 71/69/70ms và subtree `getUniforms` 101,4/95,5/93,6ms; cho thấy hướng cải thiện lặp lại được, nhưng không dùng làm số liệu của chính lượt release cuối.

**Nhiễu đã phát hiện:** một lượt đo trong khi Chrome kiểm UI riêng đang render một scene high khác ghi nhận task 748ms và ready khoảng 6,3 giây. Sau đóng viewer/Chrome kiểm UI riêng, ba lượt độc lập trở lại mức 69–71ms, rồi release ở 66ms. [INFERENCE] GPU/driver contention làm mất tính so sánh với baseline độc lập; lượt tranh GPU không được trộn vào bảng, nhưng là rủi ro thật nếu nhiều scene nặng chạy đồng thời. Không suy từ kết quả desktop này rằng mobile hoặc nhiều tab sẽ không lag.

### Quyết định cache

- **Asset GLB tĩnh:** giữ `loadSceneAsset` dùng `cache: "force-cache"`; tên có hash nội dung. Giữ kiểm size/checksum và disposal. Khi asset đổi, đổi hash/manifest; không ghi đè nội dung mới vào URL cũ. HTTP cache giảm tải lại, không giải quyết shader lạnh ở lần mở đầu.
- **HDR:** tiếp tục browser HTTP cache qua Three loader với URL versioned. Không thêm CacheStorage/service worker riêng. Chính sách TTL của host GitHub Pages do host kiểm soát; chưa thay cấu hình CDN.
- **Business projection:** giữ `cache: "no-cache"` trong `projection.ts`, nghĩa là revalidate HTTP cache, không phải `no-store`. Giữ kiểm version/schema, allowlist, freshness 24 giờ và expiry. Không cache dài hạn availability/tenant trong bộ nhớ.
- **Scene đã parse/GPU objects:** chưa thêm shared cache. Runtime hiện sở hữu/dispose geometry/material/texture; dùng chung scene giữa các mount/tier dễ double-dispose và giữ VRAM. Chỉ cân nhắc cache CPU buffers/parse khi có số đo warm re-entry chứng minh cần, kèm ownership/eviction rõ.

### Kiểm chứng và lệnh tái chạy

Đã chạy thành công build production (bao gồm asset size/checksum), `npx tsc --noEmit`, `npm run test:scene` (6/6), và harness loading release. Đã kiểm surface thật desktop 1366×900, mobile 390×844 DPR 2/reduced motion; 70% không ảnh/không tràn, viewer đủ cảnh, chọn tầng/góc nhìn/đổi daylight, WebGL context loss → thông báo lỗi → restore hoạt động. Chưa kiểm điện thoại vật lý hoặc mạng di động thật.

Harness `scripts/profile-3d-startup.mjs` dùng Node 22+/Chrome có sẵn, không dependency mới. `--check-loading` chặn building/tree có kiểm soát, kiểm cap 70/95 và không ready/100% sớm; giữ chọn tầng trong lúc tải và focus front khi ready; đổi tầng/góc nhìn; chuyển trang; building failure không hoàn tất giả. Performance không dùng ngưỡng assertion cố định vì phụ thuộc máy.

```sh
npm run build
# Chạy host static export ở port/base path của bạn; không dùng Next dev để so performance.
node scripts/profile-3d-startup.mjs http://127.0.0.1:3199/le-grande-center/ /tmp/le-grande-startup --check-loading
```

Mỗi lần tạo `<prefix>.json` (số đo + kết quả smoke) và `<prefix>.cpuprofile` để mở trong Chrome DevTools. Profile tạm của Chrome được xóa tự động. Lượt baseline nằm tại `/tmp/le-grande-before-{1,2,3}.{json,cpuprofile}`; release tại `/tmp/le-grande-release.{json,cpuprofile}` trên máy đo, không được đóng gói vào repo. Khi benchmark, đóng các viewer 3D kiểm thử khác để tránh tranh GPU; giữ cùng viewport, tier, cache và thời lượng capture.
