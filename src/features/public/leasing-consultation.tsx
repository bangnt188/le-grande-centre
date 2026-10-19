"use client";

import { useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { Badge, Button, CheckboxField, Modal, TextField } from "@mall/ui";
import { SurveyForm, useSurveySubmission } from "@mall/ui/forms";
import type { LeasingUnit } from "./leasing-model";
import { useWebsiteSettings } from "./website-settings";
import { telephoneHref } from "@/shared/admin/website-defaults";
import styles from "./leasing-consultation.module.css";
import { createContactSubmitter } from "@/features/contact/submit-contact";

function ContactIcon({ kind }: { kind: "chat" | "phone" | "callback" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === "chat" ? <path d="M20 11a8 8 0 0 1-8 8H5l-3 3v-7a8 8 0 1 1 18-4Z"/> : <><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5Z"/>{kind === "callback" && <path d="M20 3v6h-6m6 0-6-6"/>}</>}</svg>;
}
function Chevron() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>; }

export function LeasingConsultation({ unit, pair, className, open: controlledOpen, onOpenChange, triggerLabel = "Yêu cầu tư vấn", returnFocusRef }: {
  unit: LeasingUnit;
  pair: readonly [LeasingUnit, LeasingUnit] | null;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerLabel?: string | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [callback, setCallback] = useState(false);
  const [scope, setScope] = useState("single");
  const [errors, setErrors] = useState<{ name?: string; phone?: string; consent?: string }>({});
  const [sendContact] = useState(createContactSubmitter);
  const portal = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const open = controlledOpen ?? internalOpen;
  const { settings } = useWebsiteSettings();
  const pairLabel = pair ? `${pair[0].id} – ${pair[1].id}` : unit.id;
  const submission = useSurveySubmission<{ name: string; phone: string; unit: string; scope: string }>({ mode: "live", storageKey: "legrande:callback-live-rate-limit:v1", storage: "local", onSubmit: values => sendContact({ name: values.name, phone: values.phone, space: values.unit, scope: values.scope, unitId: unit.id, intent: "callback", consent: true, company: "", email: "", business: "", area: "", timing: "", note: "" }) });
  function changeOpen(next: boolean) {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) { setCallback(false); setErrors({}); submission.dismissNotice(); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submission.ready || submission.submitting || submission.coolingDown) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const value = String(values.get("phone") ?? "").trim();
    const digits = value.replace(/\D/g, "");
    const next: typeof errors = {};
    if (!name) next.name = "Nhập họ và tên.";
    if (!/^[+0-9().\s-]+$/.test(value) || digits.length < 9 || digits.length > 15 || value.length > 32) next.phone = "Nhập số điện thoại hợp lệ, từ 9 đến 15 chữ số.";
    if (values.get("consent") !== "on") next.consent = "Vui lòng đồng ý để bộ phận kinh doanh liên hệ.";
    setErrors(next);
    submission.dismissNotice();
    const first = next.name ? "name" : next.phone ? "phone" : next.consent ? "consent" : null;
    if (first) { const field = form.elements.namedItem(first); if (field instanceof HTMLElement) field.focus(); return; }
    if (await submission.submit({ name, phone: value, unit: scope === "pair" ? pairLabel : unit.id, scope }) === "success") { form.reset(); setScope("single"); }
  }
  return <div ref={portal} className={styles.host} data-ui-theme="shopping-mall" data-ui-scheme="light">
    {triggerLabel && <Button ref={trigger} variant="primary" className={className} effect="shine" aria-haspopup="dialog" aria-expanded={open} onClick={() => changeOpen(true)}><span>{triggerLabel}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></Button>}
    <Modal open={open} onOpenChange={changeOpen} title={`Tư vấn mặt bằng ${pairLabel}`} description="Chọn phương thức liên hệ thuận tiện nhất" closeLabel="Đóng tư vấn" portalContainer={portal} returnFocusRef={returnFocusRef ?? (triggerLabel ? trigger : undefined)}>
      <section className={styles.summary} aria-label="Mặt bằng đang quan tâm">
        <div className={styles.summaryHeading}><strong>{pair ? "Shophouse liên thông hai tầng" : `Mặt bằng ${unit.id} · Tầng ${unit.floorId}`}</strong><Badge tone="neutral">Tham khảo</Badge></div>
        {pair ? <><p>Tầng 1: {pair[0].area.toLocaleString("vi-VN")} m² · Tầng 2: {pair[1].area.toLocaleString("vi-VN")} m²</p><p className={styles.total}>Tổng diện tích: {(pair[0].area + pair[1].area).toLocaleString("vi-VN")} m²</p><p>Có thể thuê riêng từng căn hoặc kết hợp hai tầng. Đang xem {unit.id}.</p></> : <p>Diện tích tham khảo: {unit.area.toLocaleString("vi-VN")} m² · {unit.types.join(" · ") || "Tư vấn công năng"}</p>}
      </section>
      {!callback ? <><p className={styles.question}>Quý khách muốn được hỗ trợ như thế nào?</p><div className={styles.choices}>
        <a href={settings.zaloUrl} target="_blank" rel="noopener noreferrer"><ContactIcon kind="chat"/><span><strong>Trao đổi qua Zalo</strong><small>Nhắn tin và nhận tài liệu</small></span><Chevron/></a>
        <a href={telephoneHref(settings.hotline)}><ContactIcon kind="phone"/><span><strong>Gọi bộ phận kinh doanh</strong><small>Trao đổi trực tiếp · {settings.hotline}</small></span><Chevron/></a>
        <button type="button" onClick={() => setCallback(true)}><ContactIcon kind="callback"/><span><strong>Yêu cầu gọi lại</strong><small>Để lại số điện thoại để được liên hệ</small></span><Chevron/></button>
      </div><p className={styles.note}>Diện tích tham khảo theo tài liệu dự án; xác nhận tình trạng và phương án thuê với bộ phận kinh doanh. Yêu cầu gọi lại được gửi đến đội ngũ Le Grande Centre.</p></> : <SurveyForm submission={submission} feedback={{ successTitle: "Đã tiếp nhận yêu cầu gọi lại", successMessage: "Đội ngũ Le Grande Centre sẽ liên hệ theo số điện thoại bạn cung cấp." }} onSubmit={submit} noValidate className={styles.callback} aria-label="Yêu cầu gọi lại">
        <Button variant="quiet" onClick={() => { setCallback(false); setErrors({}); submission.dismissNotice(); }}>Trở lại phương thức liên hệ</Button>
        <h3>Yêu cầu gọi lại</h3>
        {pair && <fieldset className={styles.scope}><legend>Phương án quan tâm</legend><label><input type="radio" name="scope" value="single" checked={scope === "single"} onChange={() => setScope("single")}/>Thuê riêng {unit.id} · {unit.area.toLocaleString("vi-VN")} m²</label><label><input type="radio" name="scope" value="pair" checked={scope === "pair"} onChange={() => setScope("pair")}/>Kết hợp {pairLabel} · {(pair[0].area + pair[1].area).toLocaleString("vi-VN")} m²</label></fieldset>}
        <TextField id={`${id}-name`} name="name" autoComplete="name" required label="Họ và tên" placeholder="Nhập họ và tên" maxLength={100} error={errors.name}/>
        <TextField id={`${id}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" required label="Số điện thoại" placeholder="Số điện thoại của quý khách" maxLength={32} error={errors.phone}/>
        <CheckboxField id={`${id}-consent`} name="consent" required label="Tôi đồng ý để bộ phận kinh doanh liên hệ về mặt bằng đang quan tâm." error={errors.consent}/>
        <Button type="submit" variant="primary" disabled={!submission.ready || submission.coolingDown} loading={submission.submitting}>{submission.coolingDown ? `Gửi lại sau ${submission.countdown}` : "Gửi thử yêu cầu gọi lại"}</Button>
      </SurveyForm>}
    </Modal>
  </div>;
}
