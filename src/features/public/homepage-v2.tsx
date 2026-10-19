import Link from "next/link";
import { r2AssetBase } from "@/config/site";
import { SiteFooter } from "./site-footer";
import { WebsiteHotlineLink } from "./website-settings";
import { HomeStrategicMap } from "./home-strategic-map";
import { readPublicLeasing } from "@/server/public-leasing";
import { HomeScrollStory, Arrow, SpacesGallery, OverviewGallery } from "./homepage-v2-interactive";
import HomeProjectVideo from "./home-project-video";
import { homepageHeroSources, responsiveImageProps } from "./responsive-images";
import { FloorShowcase } from "./floor-showcase";
import { SiteHeader } from "./site-header";
import { reveal, revealGroup } from "@mall/ui/motion";
import styles from "./homepage-v2.module.css";
const reasons = [
  { title: "Vị trí đắc địa", description: "Tọa lạc ngay trung tâm đô thị Sóc Trăng, thuận tiện kết nối các hoạt động thương mại, dịch vụ và dân cư trong khu vực." },
  { title: "Hệ sinh thái vững mạnh", description: "Quy tụ cộng đồng doanh nghiệp đa ngành, kiến tạo môi trường hợp tác, nơi mỗi đơn vị là một mắt xích trong chuỗi giá trị chung." },
  { title: "Đa dạng công năng", description: "Kiến trúc hiện đại, không gian mở thoáng đãng, thiết kế tối ưu hóa công năng sử dụng." },
  { title: "Quản lý chuyên nghiệp", description: "Hạ tầng và không gian vận hành được định hướng để doanh nghiệp tập trung phát triển trải nghiệm của riêng mình." },
  { title: "Tiềm năng dài hạn", description: "Một địa điểm kinh doanh gắn với nhịp phát triển đô thị và nhu cầu thương mại, dịch vụ của cộng đồng." },
  { title: "Thông tin minh bạch", description: "Tìm hiểu mặt bằng qua brochure dự án, hồ sơ hiện có và trao đổi trực tiếp với đội ngũ tư vấn." },
];

const locationHighlights = [
  {
    title: "Vị trí trung tâm",
    description: "Bên vòng xoay Tượng đài 3 Cô Gái, kết nối trục đường thương mại Hùng Vương - Nguyễn Chí Thanh",
  },
  {
    title: "Thương mại",
    description: "Cách Chợ Sóc Trăng 2.7km",
  },
  {
    title: "Giáo dục",
    description: "Trường Tiểu học Sóc Trăng và Trường THPT Chuyên Nguyễn Thị Minh Khai.",
  },
  {
    title: "Văn hóa và không gian xanh",
    description: "Khu văn hóa Hồ Nước Ngọt, Trung tâm Văn Hóa - Thể Thao Sóc Trăng",
  },
];

export default async function HomePageV2() {
  const { units } = await readPublicLeasing();
  const featuredUnits = [1, 2, 3, 4].flatMap(floor => { const unit = units.find(item => item.floorId === floor); return unit ? [unit] : []; });
  const assetBase = r2AssetBase;
  const heroSources = homepageHeroSources(assetBase);
  return <div className={styles.page} data-homepage-version="2" data-ui-interaction-group="colors">
    <SiteHeader/>
    <main id="main-content" tabIndex={-1}>
      <HomeScrollStory hero={<section className={styles.hero} aria-labelledby="home-title">
        <picture><source {...heroSources.mobile}/><img className={styles.heroImage} {...heroSources.desktop} alt="Không gian thương mại với mặt tiền xanh và lối đi bộ" fetchPriority="high"/></picture>
        <div className={styles.heroInner} {...revealGroup({ stagger: 120, delayCap: 240 })}>
          <h1 id="home-title" {...reveal({ preset: "slide-left", duration: 3000 })}>LE GRANDE<br/>CENTRE</h1>
          <p {...reveal({ preset: "slide-left", duration: 3000 })}>Điểm đến thương mại đẳng cấp tại trung tâm đô thị Sóc Trăng, kết hợp không gian thương mại – dịch vụ – văn phòng hiện đại dành cho những thương hiệu đang tìm kiếm một địa điểm kinh doanh thực tế và giàu tiềm năng phát triển.</p>
          <div className={styles.heroActions} {...reveal({ preset: "slide-left", duration: 3000 })}><Link href="/mat-bang/" prefetch={false} className={styles.paperButton}>Xem mặt bằng <Arrow/></Link><Link href="/lien-he/" prefetch={false} className={styles.heroOutline}>Đặt lịch tham quan <Arrow/></Link></div>
          <dl className={styles.heroStats} {...revealGroup({ stagger: 100, delayCap: 200 })}><div {...reveal({ preset: "fade-up", duration: 3000 })}><dt>Tầng thương mại</dt><dd>06</dd><span>Retail, F&B, văn phòng & dịch vụ</span></div><div {...reveal({ preset: "fade-up", duration: 3000 })}><dt>Phân khu công năng</dt><dd>03</dd><span>Nhiều quy mô, nhiều mô hình</span></div><div {...reveal({ preset: "fade-up", duration: 3000 })}><dt>Mặt tiền</dt><dd>02</dd><span>Kết nối nhịp sống đô thị</span></div></dl>
        </div>
        <a href="#gioi-thieu" className={styles.scrollLink} aria-label="Cuộn tới giới thiệu dự án"><span>Khám phá</span><svg width="18" height="24" viewBox="0 0 18 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M9 2v18m-5-5 5 5 5-5"/></svg></a>
      </section>}>

      <section className={styles.film} aria-label="Phim giới thiệu dự án">
        <HomeProjectVideo/>
        <span>Le Grande Centre · Phim giới thiệu dự án</span>
      </section>

      <section id="gioi-thieu" className={`${styles.section} ${styles.introduction}`} aria-labelledby="introduction-title">
        <h2 id="introduction-title" {...reveal({ preset: "fade-up", duration: 1500 })}><em>Nhịp Thở <span>Mới</span> – Tầm Vóc <span>Mới</span></em></h2>
        <div className={styles.introGrid} {...revealGroup({ stagger: 120 })}>
          <figure {...reveal({ preset: "zoom-in", duration: 1500 })}>
            <img {...responsiveImageProps("/images/home-v2/introduction.webp", assetBase, "(max-width:720px) 88vw, (max-width:1340px) 47vw, 600px")} alt="Le Grande Centre và vòng xoay Tượng đài 3 Cô Gái" loading="lazy" decoding="async"/>
          </figure>
          <div {...reveal({ preset: "lift-in", duration: 1500 })}>
            <p>Nằm tại vòng xoay Tượng đài 3 Cô Gái, Le Grande Centre được định hướng trở thành điểm đến thương mại, dịch vụ, văn phòng đa chức năng tại khu vực Sóc Trăng. Thay vì một địa điểm riêng lẻ, doanh nghiệp có cơ hội hoạt động trong một tổ hợp quy tụ nhiều nhu cầu: mua sắm, ẩm thực, làm việc và trải nghiệm.</p>
            <p>Chúng tôi tin rằng một mặt bằng phù hợp phải giúp thương hiệu được nhận diện rõ hơn, tiếp cận thuận tiện hơn và có nền tảng để phát triển lâu dài.</p>
            <Link href="/tong-quan/" className={styles.textLink} prefetch={false}>Tìm hiểu Le Grande Centre <Arrow/></Link>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.location}`} aria-labelledby="location-title">
        <div className={styles.locationHeader} {...revealGroup({ stagger: 100 })}>
          <div className={styles.locationHeaderLeft} {...reveal({ preset: "fade-up", duration: 1200 })}>
            <span className={styles.locationEyebrow}>VỊ TRÍ</span>
            <h2 id="location-title" className={styles.locationTitle}>
              Vị Trí Chiến Lược
            </h2>
          </div>
          <p className={styles.locationHeaderDesc} {...reveal({ preset: "fade-up", duration: 1200, delay: 100 })}>
            Bên vòng xoay Tượng đài 3 Cô Gái, Le Grande Centre kết nối các điểm đến thương mại, giáo dục và văn hóa trong khu vực.
          </p>
        </div>

        <HomeStrategicMap revealProps={reveal({ preset: "zoom-in", duration: 1400 })} />

        <blockquote className={styles.locationQuote} {...reveal({ preset: "fade-up", duration: 1200 })}>
          Sóc Trăng đang bước vào giai đoạn phát triển hạ tầng đồng bộ và hoàn thiện, vị trí trung tâm sẽ trở thành tài sản khan hiếm không thể tái tạo.
        </blockquote>

        <div className={styles.locationFeaturesGrid} {...revealGroup({ stagger: 90 })}>
          {locationHighlights.map(item => (
            <div key={item.title} className={styles.locationFeatureCard} {...reveal({ preset: "fade-up", duration: 1000 })}>
              <div className={styles.locationFeatureHeader}>
                <div className={styles.locationFeatureIcon} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2 C12 7.5 16.5 12 22 12 C16.5 12 12 16.5 12 22 C12 16.5 7.5 12 2 12 C7.5 12 12 7.5 12 2 Z" />
                  </svg>
                </div>
                <h3>{item.title}</h3>
              </div>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="phan-khu" className={`${styles.section} ${styles.floors}`} aria-labelledby="floors-title"><div className={styles.sectionHeading}><h2 id="floors-title">Sáu tầng.<br/><em>Nhiều cơ hội kinh doanh.</em></h2></div><FloorShowcase assetBase={assetBase} units={units}/></section>

      <section id="khong-gian" className={`${styles.section} ${styles.spaces}`} aria-labelledby="spaces-title"><div className={styles.sectionHeading}><div><h2 id="spaces-title"><em>Đa dạng loại hình,<br/>linh hoạt lựa chọn.</em></h2><p>Định hướng tích hợp nhiều tiện ích trong cùng một không gian, từ văn phòng hiện đại đến chuỗi F&B, retail, dịch vụ và giải trí.</p></div></div><SpacesGallery assetBase={assetBase}/></section>

      <section className={styles.leasing} aria-labelledby="leasing-title"><div className={styles.section}><div className={styles.sectionHeading}><h2 id="leasing-title">Tìm không gian phù hợp<br/><em>cho doanh nghiệp của bạn.</em></h2><Link href="/mat-bang/" className={styles.textLink} prefetch={false}>Khám phá tất cả mặt bằng <Arrow/></Link></div><div className={styles.unitGrid}>{featuredUnits.map(unit => <Link key={unit.id} href={`/mat-bang/${unit.id}/`} className={styles.unitCard} prefetch={false}><div className={styles.unitImage}><img {...responsiveImageProps(unit.floorId <= 2 ? "/images/home-v2/facade-detail.jpg" : "/images/home-v2/upper-detail.jpg", assetBase, "(max-width:720px) 48vw, 30vw")} alt={`Phối cảnh minh họa khu ${unit.floorId <= 2 ? "shophouse" : "dịch vụ và văn phòng"}`} loading="lazy" decoding="async"/><span>Tầng {unit.floorId}</span></div><div className={styles.unitContent}><h3>{unit.id} <Arrow/></h3><p>{unit.types.join(" · ")}</p><dl><div><dt>Diện tích</dt><dd>{unit.area.toLocaleString("vi-VN")} m²</dd></div>{unit.dimensions && <div><dt>Kích thước</dt><dd>{unit.dimensions.width} × {unit.dimensions.depth} m</dd></div>}</dl><span className={styles.unitLink}>Xem chi tiết mặt bằng</span></div></Link>)}</div></div></section>

      <section className={`${styles.section} ${styles.overview}`} aria-labelledby="overview-title"><div className={styles.sectionHeading}><h2 id="overview-title">Tổng quan<br/><em>Le Grande Centre.</em></h2><Link href="/tong-quan/" className={styles.textLink} prefetch={false}>Tìm hiểu dự án <Arrow/></Link></div><OverviewGallery assetBase={assetBase}/><div className={styles.mosaic}><figure><img {...responsiveImageProps("/images/home-v2/facade-detail.jpg", assetBase, "(max-width:720px) 100vw, 62vw")} alt="Phối cảnh shophouse và mặt tiền thương mại" loading="lazy" decoding="async"/><figcaption>Không gian cho thương hiệu</figcaption></figure><figure><img {...responsiveImageProps("/images/home-v2/upper-detail.jpg", assetBase, "(max-width:720px) 88vw, 55vw")} alt="Phối cảnh không gian tầng trên Le Grande Centre" loading="lazy" decoding="async"/><figcaption>Những kết nối mới</figcaption></figure><figure><img {...responsiveImageProps("/images/home-v2/architecture-detail.jpg", assetBase, "(max-width:720px) 88vw, 55vw")} alt="Chi tiết phối cảnh kiến trúc Le Grande Centre" loading="lazy" decoding="async"/><figcaption>Một tầm nhìn dài hạn</figcaption></figure></div></section>

      <section id="ly-do-lua-chon" className={styles.reasons} aria-labelledby="reasons-title"><img className={styles.reasonsImage} {...responsiveImageProps("/images/home-v2/reasons-background.webp", assetBase, "max(100vw, 1900px)")} alt="" loading="lazy" decoding="async"/><div className={styles.section}><h2 id="reasons-title"><em>Tại Sao Chọn <span>Le Grande Centre?</span></em></h2><p className={styles.reasonsIntro}>Một nơi để kinh doanh. Một nền tảng để cùng phát triển.</p><div className={styles.reasonGrid}>{reasons.map(reason => <article key={reason.title}><h3><em>{reason.title}</em></h3><p>{reason.description}</p></article>)}</div></div></section>

      <section className={styles.contact} aria-labelledby="contact-title"><div><h2 id="contact-title"><em>Đặt lịch xem mặt bằng<br/>thực tế.</em></h2><p>Mỗi doanh nghiệp có một nhu cầu khác nhau.<br/>Cùng tìm không gian phù hợp với bạn.</p><div className={styles.contactActions}><Link href="/lien-he/" className={styles.paperButton} prefetch={false}>Liên hệ tư vấn <Arrow/></Link><WebsiteHotlineLink prefix="Hotline: "/></div></div></section>
      </HomeScrollStory>
    </main>
    <SiteFooter/>
  </div>;
}
