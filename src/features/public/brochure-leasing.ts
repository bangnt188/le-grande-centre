import type { LeasingUnit } from "./leasing-model";
export const BROCHURE_PATH = "/le-grande-brochure.pdf";

// One-time brochure seed metadata. Public pages read the versioned database projection.
const shophouse = ["Shophouse"];
const flexible = ["Mặt bằng linh hoạt"];
const cinema = ["Rạp chiếu phim (dự kiến)"];
const outdoor = ["Dịch vụ ngoài trời"];

// Named boundaries on brochure p.5 registered against the north-up Maps site.
// Geographic aspects are approximate; they do not certify doors, views or survey bearings.
const BROCHURE_ORIENTATION = {
  front: "Nam", rear: "Bắc", lakeSide: "Tây", waterworksSide: "Đông",
  sourceUrl: "https://www.google.com/maps/place/Le+Grande+Centre/@9.6101864,105.9692089,17z/data=!3m1!4b1!4m6!3m5!1s0x31a04d86b7d9a867:0x58da1a5e9f7000e3!8m2!3d9.6101864!4d105.9717892!16s%2Fg%2F11nb37lyjk",
};
const { front, rear: rearDirection, lakeSide, waterworksSide } = BROCHURE_ORIENTATION;
const frontRear = front + " / " + rearDirection;
const cornerOrientations: Readonly<Partial<Record<string, string>>> = {
  "A.1": frontRear + " / " + lakeSide, "A.11": frontRear + " / " + waterworksSide,
  "B.1": frontRear + " / " + lakeSide, "B.11": frontRear + " / " + waterworksSide,
  "C.12": front + " / " + lakeSide, "C.23": front + " / " + waterworksSide,
  "D.12": front + " / " + lakeSide, "D.23": front + " / " + waterworksSide,
  "E.6": front + " / " + lakeSide,
};

type BrochureUnit = Omit<LeasingUnit, "availability" | "plan">;
function row(floorId: number, prefix: string, first: number, sizes: readonly (readonly [number, number])[], depth: number, types: readonly string[], orientation: string): BrochureUnit[] {
  return sizes.map(([area, width], index) => {
    const id = `${prefix}.${first + index}`;
    const unit: BrochureUnit = {
      id, floorId, area, types, orientation: cornerOrientations[id] ?? orientation,
      dimensions: { width, depth },
    };
    return unit;
  });
}

const aWest = [[179, 10], [147, 8], [147, 8], [147, 8], [147, 8]] as const;
const aEast = [[131, 8], [147, 8], [147, 8], [147, 8], [147, 8], [179, 10]] as const;
const bWest = [[193, 10], [158, 8], [158, 8], [158, 8], [164, 8]] as const;
const bEast = [[164, 8], [158, 8], [158, 8], [158, 8], [158, 8], [193, 10]] as const;
const upperWest = [[54, 5.5], [78, 8], [78, 8], [78, 8], [78, 8]] as const;
const upperEast = [[78, 8], [78, 8], [78, 8], [78, 8], [78, 8], [54, 5.5]] as const;
const lower = [[83, 9.9], [67, 8], [67, 8], [67, 8], [67, 8], [67, 8], [67, 8], [67, 8], [67, 8], [67, 8], [67, 8], [83, 9.9]] as const;

export const BROCHURE_UNITS: readonly BrochureUnit[] = [
  ...row(1, "A", 1, aWest, 19, shophouse, frontRear),
  ...row(1, "A", 6, aEast, 19, shophouse, frontRear),
  ...row(2, "B", 1, bWest, 19, shophouse, frontRear),
  ...row(2, "B", 6, bEast, 19, shophouse, frontRear),
  ...row(3, "C", 1, upperWest, 9.8, flexible, rearDirection),
  ...row(3, "C", 6, upperEast, 9.8, flexible, rearDirection),
  ...row(3, "C", 12, lower, 8.4, flexible, front),
  ...row(4, "D", 1, upperWest, 9.8, flexible, rearDirection),
  ...row(4, "D", 6, upperEast, 9.8, flexible, rearDirection),
  ...row(4, "D", 12, lower, 8.4, flexible, front),
  ...row(5, "E", 1, [[79, 8.1], [78, 8], [78, 8], [78, 8]], 9.8, flexible, rearDirection),
  ...row(5, "E", 5, [[1000, 50]], 20, cinema, rearDirection + " / " + front + " / " + waterworksSide),
  ...row(5, "E", 6, [[83, 9.9], [67, 8], [67, 8], [67, 8], [67, 8], [67, 8]], 8.4, flexible, front),
  ...row(6, "F", 1, [[46, 7.8]], 6, [], "Nội khu — hướng chưa xác nhận"),
  { id: "F.2", floorId: 6, area: 1020, types: outdoor,
    orientation: front + " / " + lakeSide + " / " + rearDirection + " / " + waterworksSide,
    note: "Không gian ngoài trời đa hướng; brochure gợi ý café, ăn uống, ngắm cảnh, hội nghị và sự kiện. Không có kích thước cạnh đầy đủ trong tài liệu.",
  },
];
