"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@mall/ui";
import { useWebsiteSettings } from "./website-settings";
import styles from "./homepage-v2.module.css";

const GOOGLE_MAPS_EMBED_URL =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3933.8266955678832!2d105.969214276063!3d9.610186390476178!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31a04d86b7d9a867%3A0x58da1a5e9f7000e3!2sLe%20Grande%20Centre!5e0!3m2!1sen!2s!4v1791624863663!5m2!1sen!2s";

const GOOGLE_MAPS_PLACE_URL =
  "https://www.google.com/maps/place/Le+Grande+Centre/@9.6101864,105.9692089,17z/data=!3m1!4b1!4m6!3m5!1s0x31a04d86b7d9a867:0x58da1a5e9f7000e3!8m2!3d9.6101864!4d105.9717892!16s%2Fg%2F11nb37lyjk";

export function HomeStrategicMap({ revealProps }: { revealProps?: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { settings } = useWebsiteSettings();

  useEffect(() => {
    let node = document.getElementById("strategic-map-portal");
    if (!node) {
      node = document.createElement("div");
      node.id = "strategic-map-portal";
      node.className = styles.strategicMapPortal;
      document.body.appendChild(node);
    }
    setPortalNode(node);
  }, []);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [open]);

  return (
    <div className={styles.locationMapHost} {...revealProps}>
      <div
        className={styles.locationMapCard}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-label="Sơ đồ vị trí chiến lược Le Grande Centre trong bán kính 3 km. Nhấn để mở Google Maps tương tác."
      >
        <picture>
          <source type="image/webp" srcSet="/images/home-v2/strategic-map.webp" />
          <img
            src="/images/home-v2/strategic-map.png"
            alt="Sơ đồ minh hoạ vị trí chiến lược Le Grande Centre kết nối vòng xoay Tượng đài 3 Cô Gái, Hồ Nước Ngọt và các trục giao thông Sóc Trăng trong bán kính 3 km"
            width={1600}
            height={1000}
            loading="lazy"
            decoding="async"
            className={styles.locationMapImage}
          />
        </picture>
        <button
          ref={triggerRef}
          type="button"
          className={styles.locationMapButton}
          onClick={e => {
            e.stopPropagation();
            setOpen(true);
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Mở vị trí trên Google Maps (bản đồ tương tác)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span>Mở trên Map</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          </svg>
        </button>
      </div>

      <Modal
        title="Vị trí Le Grande Centre trên Google Maps"
        description="Vòng xoay Tượng đài 3 Cô Gái, TP. Sóc Trăng, Tỉnh Sóc Trăng"
        closeLabel="Đóng bản đồ"
        open={open}
        onOpenChange={setOpen}
        portalContainer={portalNode ?? undefined}
        returnFocusRef={triggerRef}
      >
        {open && (
          <div className={styles.locationModalContent}>
            <div className={styles.modalMapFrame}>
              <iframe
                src={GOOGLE_MAPS_EMBED_URL}
                title="Bản đồ tương tác vị trí Le Grande Centre trên Google Maps"
                width="100%"
                height="100%"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                className={styles.modalMapIframe}
              />
            </div>
            <div className={styles.modalFooter}>
              <div className={styles.modalAddress}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <address>{settings.address}</address>
              </div>
              <a
                href={GOOGLE_MAPS_PLACE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.modalExternalButton}
              >
                <span>Mở trong ứng dụng Google Maps</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                </svg>
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
