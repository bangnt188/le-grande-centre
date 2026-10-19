import type { ProjectDocumentGroup } from "./project-document-model";
import { BROCHURE_PATH } from "./brochure-leasing";
import type { ProjectReasonsContent } from "./project-reasons-model";

export const INVESTOR_LETTER = [
  "Chúng tôi hiểu rằng khi chọn Le Grande Centre, quý đối tác không chỉ chọn một mặt bằng, mà đang đặt niềm tin vào một tầm nhìn, một cam kết và một đội ngũ cùng đồng hành trên hành trình phát triển.",
  "Chúng tôi tin rằng một công trình giá trị không chỉ đến từ quy mô, mà còn được đầu tư với tinh thần chỉn chu về chất lượng, minh bạch về tiến độ và bền bỉ trong cam kết vận hành. Mỗi căn shophouse, mỗi không gian tiện ích đều được thực hiện với tiêu chuẩn hiện đại, xứng tầm với kỳ vọng của các nhà đầu tư đã đặt niềm tin vào chúng tôi.",
  "Le Grande Centre không chỉ đầu tư cơ sở vật chất mà dự án còn song hành xây dựng tương lai cho một vùng đất đang chuyển mình.",
];

export const LETTER_BACKGROUND_PATH = "/client-reference/legacy/letter-background.jpg";

// Source labels from legrandecentre.vn. Publication availability follows actual
// downloaded files, not the presence of a link on the old website.
export const PROJECT_DOCUMENTS: readonly ProjectDocumentGroup[] = [
  {
    id: "brochure", title: "Brochure Dự Án", icon: "document",
    description: "Tổng quan xây dựng, vị trí phân khu chiến lược và định vị thương mại.",
    downloads: [{ label: "Tải Brochure", path: BROCHURE_PATH, filename: "brochure-le-grande-centre.pdf" }],
  },
  {
    id: "floor-plan", title: "Phân Bổ Mặt Bằng", icon: "plan",
    description: "Sơ đồ bố trí sáu tầng, mã ô và diện tích tham khảo theo hồ sơ dự án.",
    downloads: [{ label: "Xem sơ đồ trong brochure", path: BROCHURE_PATH + "#page=5" }],
  },
  {
    id: "legal", title: "Hồ Sơ Pháp Lý", icon: "shield",
    description: "Tóm tắt tình trạng pháp lý, và giấy phép xây dựng, và các chứng từ liên quan",
    downloads: [
      { label: "Tải Quyết Định", path: "/client-reference/legacy/documents/quyet-dinh.pdf", filename: "quyet-dinh-le-grande-centre.pdf" },
    ],
  },
];

// Original marketing copy retained for later composition, not enabled on a route.
export const LEGACY_PROJECT_REASONS: ProjectReasonsContent = {
  label: "Lý Do Lựa Chọn",
  title: "Tại Sao Chọn",
  titleEmphasis: "Le Grande Centre?",
  description: "6 lý do vượt trội khiến Le Grande Centre trở thành lựa chọn hàng đầu cho doanh nghiệp và nhà đầu tư tại Sóc Trăng",
  reasons: [
    { id: "location", icon: "location", title: "Vị Trí Đắc Địa", description: "Tọa lạc ngay trung tâm đô thị Sóc Trăng, tiếp cận hàng triệu khách hàng tiềm năng mỗi ngày." },
    { id: "community", icon: "community", title: "Hệ Sinh Thái Vững Mạnh", description: "Quy tụ cộng đồng doanh nghiệp đa ngành, kiến tạo môi trường hợp tác - nơi mỗi đơn vị là một mắt xích vững chắc trong chuỗi giá trị chung." },
    { id: "design", icon: "design", title: "Thiết Kế Đẳng Cấp", description: "Kiến trúc hiện đại, không gian mở thoáng đãng, thiết kế tối ưu hóa công năng sử dụng." },
    { id: "management", icon: "management", title: "Quản Lý Chuyên Nghiệp", description: "Đơn vị quản lý vận hành giàu kinh nghiệm, đảm bảo môi trường kinh doanh lý tưởng." },
    { id: "growth", icon: "growth", title: "Tiềm Năng Tăng Giá", description: "Hưởng lợi từ đà tăng trưởng bất động sản Sóc Trăng và làn sóng đầu tư vùng miền Tây." },
    { id: "transparency", icon: "transparency", title: "Cam Kết Minh Bạch", description: "Pháp lý rõ ràng, hợp đồng minh bạch, cam kết bàn giao đúng tiến độ và chất lượng." },
  ],
  cta: {
    title: "Sẵn sàng khám phá cơ hội đầu tư?",
    description: "Liên hệ ngay để nhận tư vấn miễn phí và thông tin chi tiết về các mặt bằng còn trống.",
    label: "Đăng ký tư vấn ngay",
    href: "/lien-he/",
  },
};
