"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, PasswordField, TextField, Toast, type ToastTone } from "@mall/ui";
import { authClient } from "./auth-client";
import { clearAdminSession, ensureSession } from "./session";
import { AdminBrandImage } from "./admin-brand-image";
import { useAdminLogoUrl } from "./use-admin-logo";
import styles from "./admin-entry.module.css";

type ToastState = {
  id: number;
  tone: ToastTone;
  title?: string;
  text: string;
};

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export default function AdminEntry() {
  const logoUrl = useAdminLogoUrl();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(() => {
    if (params.get("denied")) {
      return {
        id: Date.now(),
        tone: "error",
        title: "Truy cập bị từ chối",
        text: "Tài khoản chưa được cấp quyền quản trị.",
      };
    }
    return null;
  });

  function showToast(tone: ToastTone, text: string, title?: string) {
    setToast({
      id: Date.now(),
      tone,
      title,
      text,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password") ?? "");
    setPending(true);
    setToast(null);
    try {
      if (creatingAccount) {
        const result = await authClient.signUp.email({ email, password, name: String(form.get("name") ?? "").trim() });
        if (result.error) throw new Error(result.error.message || "Không thể tạo tài khoản.");
        showToast("success", "Tài khoản đã tạo. Nếu Neon Auth yêu cầu xác minh email, hãy mở thư xác minh trước khi đăng nhập.", "Hoàn tất");
        formElement.reset();
        setEmail("");
        setCreatingAccount(false);
        return;
      }
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || "Đăng nhập thất bại.");

      clearAdminSession();
      await ensureSession({ userAction: true });

      showToast("info", "Đang mở không gian quản trị...", "Đã xác thực tài khoản");
      window.location.assign("/admin/workspace/");
    } catch (issue) {
      showToast("error", issue instanceof Error ? issue.message : "Không thể kết nối dịch vụ đăng nhập.", "Lỗi");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={`legrande-admin ${styles.root}`} data-ui-root data-ui-theme="shopping-mall" data-ui-scheme="light">
      {/* Toast Notification from component-ui */}
      {toast && (
        <div className={styles.toastRegion} role="region" aria-label="Thông báo hệ thống">
          <Toast
            key={toast.id}
            tone={toast.tone}
            title={toast.title}
            text={toast.text}
            closeLabel="Đóng thông báo"
            onDismiss={() => setToast(null)}
            duration={5000}
          />
        </div>
      )}

      {/* ================= Left Column: Brand Identity ================= */}
      <section className={styles.brandSection} aria-label="Le Grande Centre">
        <div className={styles.brandTop}>
          <Link href="/" className={styles.backLink} aria-label="Về website Le Grande Centre">
            <ArrowLeftIcon />
            <span>Về website</span>
          </Link>
        </div>

        <div className={styles.brandCenter}>
          {logoUrl && <AdminBrandImage src={logoUrl} alt="" className={styles.brandLogoImg} width={180} height={72}/>}
          <div className={styles.brandIdentity}>
            <h2 className={styles.brandTitle}>Le Grande Centre</h2>
            <span className={styles.brandBadge}>Hệ thống quản trị</span>
          </div>
        </div>

        <div className={styles.brandFooter}>
          <span>Le Grande Centre</span>
        </div>
      </section>

      {/* ================= Right Column: Authentication Card Desk ================= */}
      <section className={styles.panelSection} aria-labelledby="admin-login-title">
        <div className={styles.cardWrapper}>
          <div className={styles.authCard}>
            <header className={styles.cardHeader}>
              <h1 id="admin-login-title" className={styles.cardTitle}>
                {creatingAccount ? "Tạo tài khoản" : "Đăng nhập"}
              </h1>
            </header>

            {/* Form */}
            <form className={styles.authForm} onSubmit={submit}>
              {creatingAccount && <TextField id="admin-name" name="name" label="Họ tên" size="lg" autoComplete="name" required maxLength={120}/>}
              <TextField
                id="admin-email"
                name="email"
                type="email"
                label="Email"
                size="lg"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={254}
                value={email}
                onChange={event => setEmail(event.target.value.trim())}
              />

              <PasswordField
                id="admin-password"
                name="password"
                label="Mật khẩu"
                size="lg"
                showLabel="Hiện mật khẩu"
                hideLabel="Ẩn mật khẩu"
                autoComplete={creatingAccount ? "new-password" : "current-password"}
                minLength={creatingAccount ? 8 : 1}
                maxLength={128}
                required
              />

              {/* Submit Button using component-ui Button */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={pending}
                loadingLabel="Đang xử lý..."
                className={styles.submitBtn}
              >
                {creatingAccount ? "Tạo tài khoản" : "Đăng nhập"}
              </Button>
            </form>

            <Button type="button" variant="quiet" disabled={pending} onClick={() => setCreatingAccount(value => !value)}>
              {creatingAccount ? "Đã có tài khoản? Đăng nhập" : "Đã được cấp quyền? Tạo tài khoản"}
            </Button>
            <p className={styles.cardSubtitle}>{creatingAccount ? "Chỉ email đã được quản trị viên cấp Admin hoặc Editor mới vào được hệ thống. Sau khi tạo tài khoản, xác minh email nếu được yêu cầu." : "Quản trị viên thêm email và vai trò của bạn trong mục Cấu hình. Bạn tạo mật khẩu tại đây."}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
