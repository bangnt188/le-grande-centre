"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Maximize2,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  ArrowDown,
  Phone,
  ImageIcon,
  X,
  ShieldCheck,
  Building2,
  Sparkles,
  Store,
  Layers,
  Tv,
  Umbrella,
  Eye,
  MessageSquare,
} from "lucide-react";
import { useWebsiteSettings } from "./website-settings";
import { responsiveImageProps } from "./responsive-images";
import { BusinessSpaceConsultation } from "./business-space-consultation";
import styles from "./business-space-v2.module.css";

type LightboxImage = {
  src: string;
  alt: string;
  caption: string;
};

type ZoneInfo = {
  id: string;
  floors: string;
  eyebrow: string;
  defaultTitle: string;
  floorNumber: number;
  icon: typeof Store;
  badges: readonly string[];
  statusBadge?: string;
  descriptions: readonly string[];
  usages: readonly string[];
  floorButtons: readonly { label: string; href: string; primary?: boolean }[];
  mainImage: string;
  mainCaption: string;
  mainAlt: string;
  thumbnails: readonly {
    src?: string;
    label: string;
    alt?: string;
    caption?: string;
    isPlaceholder?: boolean;
  }[];
};

const ZONES: readonly ZoneInfo[] = [
  {
    id: "tang-01-02",
    floors: "Tầng 01–02",
    eyebrow: "TẦNG 01–02",
    defaultTitle: "Shophouse liên thông",
    floorNumber: 1,
    icon: Store,
    badges: ["11 căn", "Liên thông 2 tầng"],
    descriptions: [
      "11 căn shophouse riêng biệt liên thông tầng 1 và tầng 2.",
      "Sảnh giữa kết nối tầng 3 – 6 bằng thang máy và thang bộ.",
      "Khoảng thông tầng: không gian trưng bày cho B.5 hoặc B.6.",
    ],
    usages: ["Retail", "Showroom", "Dịch vụ"],
    floorButtons: [
      { label: "Xem mặt bằng tầng 1", href: "/mat-bang/#tang-1", primary: true },
      { label: "Xem mặt bằng tầng 2", href: "/mat-bang/#tang-2" },
    ],
    mainImage: "/images/home-v2/retail.webp",
    mainCaption: "Gợi ý không gian shophouse liên thông • Minh họa công năng",
    mainAlt: "Không gian thương mại shophouse liên thông tại Le Grande Centre",
    thumbnails: [
      {
        src: "/images/home-v2/retail.webp",
        label: "Không gian liên thông",
        alt: "Không gian shophouse liên thông tầng 1 và 2",
        caption: "Gợi ý không gian shophouse liên thông • Minh họa công năng",
      },
      {
        src: "/images/home-v2/facade-detail.jpg",
        label: "Mặt tiền",
        alt: "Mặt tiền kinh doanh shophouse",
        caption: "Mặt tiền shophouse Le Grande Centre • Phối cảnh thực tế",
      },
      {
        label: "Hiện trạng",
        isPlaceholder: true,
      },
    ],
  },
  {
    id: "tang-03-04",
    floors: "Tầng 03–04",
    eyebrow: "TẦNG 03–04",
    defaultTitle: "Mặt bằng linh hoạt",
    floorNumber: 3,
    icon: Layers,
    badges: ["Tầng 3: C.1 – C.23", "Tầng 4: D.1 – D.23"],
    descriptions: [
      "Mỗi tầng gồm 3 khu mặt bằng lớn với phương án phân chia linh hoạt.",
    ],
    usages: ["Văn phòng", "Thương mại", "Dịch vụ"],
    floorButtons: [
      { label: "Xem mặt bằng tầng 3", href: "/mat-bang/#tang-3", primary: true },
      { label: "Xem mặt bằng tầng 4", href: "/mat-bang/#tang-4" },
    ],
    mainImage: "/images/home-v2/office.webp",
    mainCaption: "Không gian có thể phân chia linh hoạt • Minh họa công năng",
    mainAlt: "Không gian mặt bằng văn phòng và thương mại linh hoạt",
    thumbnails: [
      {
        src: "/images/home-v2/office.webp",
        label: "Không gian mở",
        alt: "Mặt bằng tầng không gian mở",
        caption: "Không gian có thể phân chia linh hoạt • Minh họa công năng",
      },
      {
        src: "/images/home-v2/upper-detail.jpg",
        label: "Gợi ý bố trí",
        alt: "Bố trí không gian làm việc hiện đại",
        caption: "Gợi ý bố trí mặt bằng văn phòng • Minh họa công năng",
      },
      {
        label: "Hiện trạng",
        isPlaceholder: true,
      },
    ],
  },
  {
    id: "tang-05",
    floors: "Tầng 05",
    eyebrow: "TẦNG 05",
    defaultTitle: "Mặt bằng & rạp dự kiến",
    floorNumber: 5,
    icon: Tv,
    statusBadge: "Định hướng công năng",
    badges: ["02 khu mặt bằng", "E.5: 1.000 m²"],
    descriptions: [
      "2 khu mặt bằng có thể phân chia linh hoạt. E.5 rộng 1.000 m² được định hướng cho cụm rạp chiếu phim.",
    ],
    usages: ["Giải trí", "Cụm rạp chiếu phim", "Dịch vụ"],
    floorButtons: [
      { label: "Xem mặt bằng tầng 5", href: "/mat-bang/#tang-5", primary: true },
    ],
    mainImage: "/images/home-v2/entertainment.webp",
    mainCaption: "Gợi ý không gian giải trí • Công năng dự kiến",
    mainAlt: "Khu vực giải trí và rạp chiếu phim dự kiến",
    thumbnails: [
      {
        src: "/images/home-v2/entertainment.webp",
        label: "Không gian giải trí",
        alt: "Sảnh giải trí và rạp chiếu phim",
        caption: "Gợi ý không gian giải trí • Công năng dự kiến",
      },
      {
        src: "/images/home-v2/architecture-detail.jpg",
        label: "Khu mặt bằng",
        alt: "Khu vực mặt bằng rộng tầng 5",
        caption: "Khu vực mặt bằng có thể phân chia linh hoạt tầng 5",
      },
      {
        label: "Hiện trạng",
        isPlaceholder: true,
      },
    ],
  },
  {
    id: "tang-06",
    floors: "Tầng 06",
    eyebrow: "TẦNG 06",
    defaultTitle: "Dịch vụ ngoài trời",
    floorNumber: 6,
    icon: Umbrella,
    badges: ["F.1: 46 m²", "F.2: 1.020 m²"],
    descriptions: [
      "Không gian ngoài trời kết nối với khoảng thông tầng của khu rạp chiếu phim dự kiến.",
    ],
    usages: ["F&B ngoài trời", "Dịch vụ"],
    floorButtons: [
      { label: "Xem mặt bằng tầng 6", href: "/mat-bang/#tang-6", primary: true },
    ],
    mainImage: "/images/home-v2/cafe.webp",
    mainCaption: "Gợi ý không gian ngoài trời • Minh họa công năng",
    mainAlt: "Không gian thư giãn ngoài trời tầng thượng Le Grande Centre",
    thumbnails: [
      {
        src: "/images/home-v2/cafe.webp",
        label: "Không gian ngoài trời",
        alt: "Không gian ngoài trời tầng 6",
        caption: "Gợi ý không gian ngoài trời • Minh họa công năng",
      },
      {
        src: "/images/home-v2/introduction.webp",
        label: "Gợi ý sử dụng",
        alt: "Gợi ý trải nghiệm ẩm thực và ngắm cảnh",
        caption: "Gợi ý sử dụng ẩm thực, café và ngắm cảnh tầng thượng",
      },
      {
        label: "Hiện trạng",
        isPlaceholder: true,
      },
    ],
  },
];

type MetricItem = {
  value: string;
  unit?: string;
  label: string;
};

const METRICS: readonly MetricItem[] = [
  { value: "06", label: "tầng thương mại" },
  { value: "12.400", unit: "m²", label: "thương mại" },
  { value: "24/7", label: "Quản lí và bảo vệ" },
  { value: "01", label: "Khu vực giữ xe nội bộ" },
  { value: "100%", label: "khu chung có PCCC" },
];

const AMENITIES = [
  {
    icon: ShieldCheck,
    title: "An ninh & PCCC",
    description: "Hệ thống kiểm soát an ninh, camera và tiêu chuẩn PCCC được quản lý chặt chẽ.",
  },
  {
    icon: Building2,
    title: "Khu vực chung",
    description: "Sảnh chính và hành lang được hoàn thiện với ngôn ngữ nhất quán, dễ định hướng thương hiệu.",
  },
  {
    icon: Sparkles,
    title: "Trải nghiệm",
    description: "Ánh sáng, cảnh quan và điểm dừng được cân nhắc để không gian mở rộng, phù hợp với nhịp sống đô thị mới.",
  },
] as const;

const TAB_ITEMS = [
  { id: "tong-the", label: "Tổng thể" },
  { id: "tang-01-02", label: "Tầng 01–02" },
  { id: "tang-03-04", label: "Tầng 03–04" },
  { id: "tang-05", label: "Tầng 05" },
  { id: "tang-06", label: "Tầng 06" },
] as const;

export function BusinessSpaceV2({ assetBase }: { assetBase: string }) {
  const { settings, floorContent } = useWebsiteSettings();
  const [activeTab, setActiveTab] = useState<string>("tong-the");
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);

  // Selected thumbnail states for each section
  const [overviewActiveIndex, setOverviewActiveIndex] = useState(0);
  const [zoneActiveIndexes, setZoneActiveIndexes] = useState<Record<string, number>>({
    "tang-01-02": 0,
    "tang-03-04": 0,
    "tang-05": 0,
    "tang-06": 0,
  });

  // Reusable consultation modal state
  const [consultModalOpen, setConsultModalOpen] = useState(false);
  const [consultModalSpace, setConsultModalSpace] = useState("Toàn bộ 6 tầng Le Grande Centre");

  // Helper to fetch current configured floor title or default fallback
  const getFloorTitle = (floorNumber: number, fallback: string) => {
    return floorContent.find(item => item.number === floorNumber)?.publicTitle ?? fallback;
  };

  // Overview media options
  const overviewMedia = [
    {
      src: "/images/le-grande-aerial-context.webp",
      alt: "Toàn cảnh công trình Le Grande Centre và kết nối đô thị Sóc Trăng",
      caption: "Toàn cảnh công trình và kết nối đô thị • Ảnh thực tế",
      label: "Toàn cảnh",
    },
    {
      src: "/images/home-v2/facade-detail.jpg",
      alt: "Mặt ngoài công trình Le Grande Centre",
      caption: "Mặt ngoài công trình Le Grande Centre • Phối cảnh thực tế",
      label: "Mặt ngoài công trình",
    },
  ];

  // Sync with URL hash
  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === "#tong-the") {
        setActiveTab("tong-the");
      } else if (hash === "#tang-01-02" || hash === "#tang-1" || hash === "#tang-2") {
        setActiveTab("tang-01-02");
      } else if (hash === "#tang-03-04" || hash === "#tang-3" || hash === "#tang-4") {
        setActiveTab("tang-03-04");
      } else if (hash === "#tang-05" || hash === "#tang-5") {
        setActiveTab("tang-05");
      } else if (hash === "#tang-06" || hash === "#tang-6") {
        setActiveTab("tang-06");
      }
    };

    if (window.location.hash) {
      syncHash();
    }
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && lightbox) {
        setLightbox(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightbox]);

  const chooseTab = (id: string, scroll = true) => {
    setActiveTab(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
      if (scroll) {
        const tabElement = document.getElementById("space-tabs");
        if (tabElement) {
          const headerOffset = 80;
          const top = tabElement.getBoundingClientRect().top + window.pageYOffset - headerOffset;
          window.scrollTo({ top, behavior: "smooth" });
        }
      }
    }
  };

  const openConsultForSpace = (spaceLabel: string) => {
    setConsultModalSpace(spaceLabel);
    setConsultModalOpen(true);
  };

  const currentOverviewItem = overviewMedia[overviewActiveIndex] ?? overviewMedia[0];
  const isAllFloorsView = activeTab === "tong-the";
  const activeZone = ZONES.find(z => z.id === activeTab);

  // Pager indices for previous/next floor navigation in compact mode
  const activeZoneIndex = activeZone ? ZONES.findIndex(z => z.id === activeZone.id) : 0;
  const prevTabId = activeZoneIndex > 0 ? ZONES[activeZoneIndex - 1]?.id : null;
  const nextTabId = activeZoneIndex < ZONES.length - 1 ? ZONES[activeZoneIndex + 1]?.id : null;

  // Render helper for an individual floor section
  const renderFloorSection = (zone: ZoneInfo, isCompactSingleView: boolean) => {
    const activeThumbIndex = zoneActiveIndexes[zone.id] ?? 0;
    const currentThumb = zone.thumbnails[activeThumbIndex] ?? zone.thumbnails[0];
    const displayImage = currentThumb.src ?? zone.mainImage;
    const displayCaption = currentThumb.caption ?? zone.mainCaption;
    const displayAlt = currentThumb.alt ?? zone.mainAlt;
    const dynamicFloorTitle = getFloorTitle(zone.floorNumber, zone.defaultTitle);

    return (
      <section
        key={zone.id}
        id={zone.id}
        className={`${styles.floorSection} ${styles.tabPanel}`}
        aria-labelledby={`heading-${zone.id}`}
      >
        <div className={styles.container}>
          <div className={styles.floorGrid}>
            {/* Cột trái: Floor Gallery */}
            <div className={styles.galleryCard}>
              <div className={styles.mainPreviewWrapper}>
                <img
                  {...responsiveImageProps(displayImage, assetBase, "(max-width: 1024px) 100vw, 58vw")}
                  className={styles.mainPreviewImage}
                  alt={displayAlt}
                />
                <div className={styles.tagBadge}>Minh họa công năng</div>
                <button
                  type="button"
                  className={styles.zoomTrigger}
                  aria-label="Phóng to ảnh"
                  onClick={() =>
                    setLightbox({
                      src: responsiveImageProps(displayImage, assetBase, "100vw", 1920).src,
                      alt: displayAlt,
                      caption: displayCaption,
                    })
                  }
                >
                  <Maximize2 size={18} aria-hidden="true" />
                </button>
              </div>

              <p className={styles.captionText}>{displayCaption}</p>

              <div className={styles.thumbnailRow}>
                {zone.thumbnails.map((thumb, idx) => {
                  if (thumb.isPlaceholder) {
                    return (
                      <div
                        key={thumb.label}
                        className={styles.thumbnailCard}
                        aria-label="Hình ảnh hiện trạng đang cập nhật"
                      >
                        <div className={`${styles.thumbnailImageWrapper} ${styles.placeholderWrapper}`}>
                          <ImageIcon size={22} strokeWidth={1.5} aria-hidden="true" />
                          <span className={styles.placeholderText}>Ảnh thực tế cần bổ sung</span>
                        </div>
                        <span className={styles.thumbnailLabel}>{thumb.label}</span>
                      </div>
                    );
                  }

                  const isActive = activeThumbIndex === idx;
                  return (
                    <button
                      key={thumb.label}
                      type="button"
                      className={`${styles.thumbnailCard} ${isActive ? styles.thumbnailActive : ""}`}
                      onClick={() =>
                        setZoneActiveIndexes(prev => ({ ...prev, [zone.id]: idx }))
                      }
                      aria-pressed={isActive}
                    >
                      <div className={styles.thumbnailImageWrapper}>
                        <img
                          {...responsiveImageProps(thumb.src!, assetBase, "200px")}
                          className={styles.thumbnailImage}
                          alt={thumb.alt ?? thumb.label}
                        />
                      </div>
                      <span className={styles.thumbnailLabel}>{thumb.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cột phải: Floor Details */}
            <div className={styles.floorContent}>
              <span className={styles.floorEyebrow}>{zone.eyebrow}</span>
              <h3 id={`heading-${zone.id}`} className={styles.floorTitle}>
                {dynamicFloorTitle}
              </h3>

              {zone.statusBadge && (
                <div className={styles.statusPill}>{zone.statusBadge}</div>
              )}

              <div className={styles.badgeRow}>
                {zone.badges.map(badge => (
                  <span key={badge} className={styles.pillBadge}>
                    {badge}
                  </span>
                ))}
              </div>

              <div className={styles.floorDescription}>
                {zone.descriptions.map((desc, i) => (
                  <p key={i}>{desc}</p>
                ))}
              </div>

              {zone.usages.length > 0 && (
                <div className={styles.suggestionGroup}>
                  <span className={styles.suggestionLabel}>Công năng gợi ý</span>
                  <div className={styles.suggestionPills}>
                    {zone.usages.map(usage => (
                      <span key={usage} className={styles.tagPill}>
                        {usage}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.floorActions}>
                {zone.floorButtons.map(btn => (
                  <Link
                    key={btn.label}
                    href={btn.href}
                    className={btn.primary ? styles.goldButton : styles.outlineButton}
                  >
                    <span>{btn.label}</span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                ))}
              </div>

              <button
                type="button"
                className={styles.floorConsultLink}
                onClick={() => openConsultForSpace(`${zone.floors}: ${dynamicFloorTitle}`)}
              >
                <span>Tư vấn phân khu này</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Điều hướng tầng trước / sau chỉ hiển thị khi ở chế độ xem gọn từng tầng */}
          {isCompactSingleView && (
            <div className={styles.floorPager}>
              {prevTabId ? (
                <button
                  type="button"
                  className={styles.pagerButton}
                  onClick={() => chooseTab(prevTabId)}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>
                    {ZONES.find(z => z.id === prevTabId)?.floors}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.pagerButton}
                  onClick={() => chooseTab("tong-the")}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Xem toàn bộ 6 tầng</span>
                </button>
              )}

              <button
                type="button"
                className={styles.pagerCenterButton}
                onClick={() => chooseTab("tong-the")}
              >
                <Eye size={16} aria-hidden="true" />
                <span>Xem toàn bộ 6 tầng</span>
              </button>

              {nextTabId ? (
                <button
                  type="button"
                  className={styles.pagerButton}
                  onClick={() => chooseTab(nextTabId)}
                >
                  <span>{ZONES.find(z => z.id === nextTabId)?.floors}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.pagerButton}
                  onClick={() => openConsultForSpace(`${zone.floors}: ${dynamicFloorTitle}`)}
                >
                  <span>Nhận tư vấn phân khu</span>
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className={styles.spacePage}>
      {/* ==================================================================
          HERO SECTION (Đúng chuẩn thiết kế khong-gian-new.png)
          ================================================================== */}
      <section className={styles.hero} aria-labelledby="space-hero-title">
        <div className={styles.heroBackdrop} aria-hidden="true">
          <img
            {...responsiveImageProps("/images/home-v2/hero.webp", assetBase, "100vw")}
            className={styles.heroBackdropImage}
            alt=""
          />
          <div className={styles.heroGradient} />
        </div>

        <div className={styles.container}>
          <div className={styles.heroInner}>
            <nav className={styles.breadcrumb} aria-label="Đường dẫn trang">
              <Link href="/" className={styles.breadcrumbLink}>
                Trang chủ
              </Link>
              <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
              <span className={styles.breadcrumbCurrent}>Không gian kinh doanh</span>
            </nav>

            <h1 id="space-hero-title" className={styles.heroTitle}>
              <span>Khám phá kiến trúc.</span>
              <span>Hình dung không gian kinh doanh.</span>
            </h1>

            <p className={styles.heroDesc}>
              Từ tổng thể tòa nhà đến công năng từng phân khu tại Le Grande Centre.
            </p>

            <div className={styles.heroActions}>
              <button
                type="button"
                className={styles.goldButton}
                onClick={() => {
                  const tabs = document.getElementById("space-tabs");
                  if (tabs) {
                    const headerOffset = 80;
                    const top = tabs.getBoundingClientRect().top + window.pageYOffset - headerOffset;
                    window.scrollTo({ top, behavior: "smooth" });
                  }
                }}
              >
                <span>Khám phá các tầng</span>
                <ArrowDown size={18} aria-hidden="true" />
              </button>
              <Link href="/mat-bang/" className={styles.outlineButton}>
                <span>Xem mặt bằng</span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================
          SECTION 1: TỔNG THỂ LE GRANDE CENTRE
          - Cột trái: Gallery Toàn cảnh
          - Cột phải: HẠ TẦNG & TIÊU CHUẨN VẬN HÀNH (Đã đưa 5 số + 3 trụ cột vào)
          ================================================================== */}
      <section id="tong-the" className={styles.overviewSection} aria-labelledby="overview-title">
        <div className={styles.container}>
          <h2 id="overview-title" className={styles.sectionHeading}>
            Tổng thể Le Grande Centre
          </h2>

          <div className={styles.overviewGrid}>
            {/* Cột trái: Gallery Toàn cảnh */}
            <div className={styles.galleryCard}>
              <div className={styles.mainPreviewWrapper}>
                <img
                  {...responsiveImageProps(currentOverviewItem.src, assetBase, "(max-width: 1024px) 100vw, 60vw")}
                  className={styles.mainPreviewImage}
                  alt={currentOverviewItem.alt}
                />
                <button
                  type="button"
                  className={styles.zoomTrigger}
                  aria-label="Phóng to ảnh"
                  onClick={() =>
                    setLightbox({
                      src: responsiveImageProps(currentOverviewItem.src, assetBase, "100vw", 1920).src,
                      alt: currentOverviewItem.alt,
                      caption: currentOverviewItem.caption,
                    })
                  }
                >
                  <Maximize2 size={18} aria-hidden="true" />
                </button>
              </div>

              <p className={styles.captionText}>{currentOverviewItem.caption}</p>

              <div className={`${styles.thumbnailRow} ${styles.thumbnailRowTwo}`}>
                {overviewMedia.map((item, index) => {
                  const isActive = overviewActiveIndex === index;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className={`${styles.thumbnailCard} ${isActive ? styles.thumbnailActive : ""}`}
                      onClick={() => setOverviewActiveIndex(index)}
                      aria-pressed={isActive}
                    >
                      <div className={styles.thumbnailImageWrapper}>
                        <img
                          {...responsiveImageProps(item.src, assetBase, "280px")}
                          className={styles.thumbnailImage}
                          alt={item.alt}
                        />
                      </div>
                      <span className={styles.thumbnailLabel}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cột phải (CỤC XANH): HẠ TẦNG & TIÊU CHUẨN VẬN HÀNH */}
            <aside className={styles.overviewStandardsCard} aria-labelledby="standards-heading">
              <span className={styles.standardsCardEyebrow}>HẠ TẦNG &amp; VẬN HÀNH</span>
              <h3 id="standards-heading" className={styles.standardsCardTitle}>
                Tiêu chuẩn không gian tại Le Grande Centre
              </h3>
              <p className={styles.standardsCardDesc}>
                Được quy hoạch đồng bộ nhằm mang lại trải nghiệm kinh doanh và thương mại cao cấp tại trung tâm Sóc Trăng.
              </p>

              {/* 5 chỉ số quy mô cốt lõi */}
              <div className={styles.standardsMetricsGrid}>
                {METRICS.map(metric => (
                  <div key={metric.label} className={styles.standardsMetricItem}>
                    <span className={styles.standardsMetricVal}>
                      {metric.value}
                      {metric.unit && <small className={styles.standardsMetricUnit}>{metric.unit}</small>}
                    </span>
                    <span className={styles.standardsMetricLbl}>{metric.label}</span>
                  </div>
                ))}
              </div>

              {/* 3 tiêu chuẩn cốt lõi */}
              <div className={styles.standardsItemsList}>
                {AMENITIES.map(amenity => {
                  const Icon = amenity.icon;
                  return (
                    <div key={amenity.title} className={styles.standardsItemRow}>
                      <div className={styles.standardsItemIcon} aria-hidden="true">
                        <Icon size={18} strokeWidth={1.6} />
                      </div>
                      <div className={styles.standardsItemContent}>
                        <strong className={styles.standardsItemTitle}>{amenity.title}</strong>
                        <p className={styles.standardsItemDesc}>{amenity.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ==================================================================
          STICKY TAB BAR (Nằm dưới Tổng thể, dính khi cuộn)
          ================================================================== */}
      <nav id="space-tabs" className={styles.stickyTabWrapper} aria-label="Điều hướng các phân khu">
        <div className={styles.container}>
          <div className={styles.tabList} role="tablist">
            {TAB_ITEMS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`${styles.tabButton} ${isActive ? styles.tabButtonActive : ""}`}
                  onClick={() => chooseTab(tab.id)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ==================================================================
          FLOOR DETAIL SECTION:
          - Khi ở Tổng thể: Show hết cả 6 tầng (chuẩn mockup khong-gian-new.png)
          - Khi chuyển tab từng tầng: Gọn lại chỉ hiển thị tầng được chọn
          ================================================================== */}
      <main id="space-content-anchor" className={styles.tabContentContainer}>
        {isAllFloorsView ? (
          <div className={styles.allFloorsWrapper}>
            {ZONES.map(zone => renderFloorSection(zone, false))}
          </div>
        ) : activeZone ? (
          <div className={styles.singleFloorWrapper}>
            {renderFloorSection(activeZone, true)}
          </div>
        ) : null}
      </main>

      {/* ==================================================================
          SECTION: BOTTOM CTA (Chỉ 1 nút Yêu cầu tư vấn & Form tái sử dụng)
          ================================================================== */}
      <section id="tu-van" className={styles.ctaSection} aria-labelledby="cta-heading">
        <div className={styles.container}>
          <div className={styles.ctaBanner}>
            <div className={styles.ctaGrid}>
              {/* Cột trái: Tiêu đề & Hotline */}
              <div>
                <h2 id="cta-heading" className={styles.ctaHeading}>
                  Bạn muốn tìm hiểu phân khu nào?
                </h2>
                <p className={styles.ctaDesc}>
                  Chọn nhu cầu để đội ngũ tư vấn hỗ trợ thông tin phù hợp.
                </p>

                <div className={styles.hotlineBox}>
                  <div className={styles.hotlineIcon} aria-hidden="true">
                    <Phone size={22} />
                  </div>
                  <div className={styles.hotlineInfo}>
                    <span className={styles.hotlineLabel}>Hotline tư vấn</span>
                    <a
                      href={`tel:${settings.hotline.replace(/\s+/g, "")}`}
                      className={styles.hotlineNumber}
                    >
                      {settings.hotline || "0973 879 563"}
                    </a>
                  </div>
                </div>
              </div>

              {/* Cột phải: 1 Nút Yêu cầu tư vấn mở Modal */}
              <div className={styles.ctaActionWrapper}>
                <button
                  type="button"
                  className={styles.ctaPrimaryButton}
                  onClick={() => openConsultForSpace("Toàn bộ 6 tầng Le Grande Centre")}
                >
                  <MessageSquare size={18} aria-hidden="true" />
                  <span>Yêu cầu tư vấn</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================
          CONSULTATION MODAL (Tái sử dụng form tư vấn Zalo / Gọi / Yêu cầu gọi lại)
          ================================================================== */}
      <BusinessSpaceConsultation
        open={consultModalOpen}
        onOpenChange={setConsultModalOpen}
        spaceName={consultModalSpace}
      />

      {/* ==================================================================
          LIGHTBOX MODAL (Phóng to ảnh)
          ================================================================== */}
      {lightbox && (
        <div
          className={styles.lightboxOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Hình ảnh phóng to"
          onClick={() => setLightbox(null)}
        >
          <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={styles.lightboxClose}
              aria-label="Đóng ảnh phóng to"
              onClick={() => setLightbox(null)}
            >
              <X size={20} aria-hidden="true" />
            </button>
            <div className={styles.lightboxImageWrapper}>
              <img
                src={lightbox.src}
                alt={lightbox.alt}
                className={styles.lightboxImage}
              />
            </div>
            {lightbox.caption && (
              <p className={styles.lightboxCaption}>{lightbox.caption}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
