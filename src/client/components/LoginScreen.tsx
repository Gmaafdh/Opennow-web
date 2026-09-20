import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import QRCode from "qrcode";
import { Check, ChevronDown, Copy, ExternalLink, Link2, QrCode } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type { AuthDeviceLoginChallenge, LoginProvider } from "@shared/gfn";
import { useTranslation } from "../i18n";
import { OpenNowLogoMark } from "./OpenNowLogoMark";
import { MotionSpinner } from "./MotionSpinner";
import { dialogMotion, smoothEase } from "./MotionProvider";

const QR_PREFERENCE_STORAGE_KEY = "opennow.login.showQr";
const COPY_FEEDBACK_MS = 1800;

export interface LoginScreenProps {
  providers: LoginProvider[];
  selectedProviderId: string;
  onProviderChange: (id: string) => void;
  onStartDeviceLogin: () => void;
  onCancelDeviceLogin: () => void;
  isLoading: boolean;
  error: string | null;
  isInitializing?: boolean;
  statusMessage?: string;
  deviceLoginChallenge?: AuthDeviceLoginChallenge | null;
  isDeviceLoginPending?: boolean;
}

function readStoredQrPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(QR_PREFERENCE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredQrPreference(isVisible: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QR_PREFERENCE_STORAGE_KEY, isVisible ? "1" : "0");
  } catch {
    // Remembering the QR preference is optional; the toggle still works for this visit.
  }
}

function formatRemainingTime(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to the legacy copy path below (non-secure origins, denied permission).
  }

  if (typeof document === "undefined") return false;
  try {
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.top = "-1000px";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(helper);
    return copied;
  } catch {
    return false;
  }
}

export function LoginScreen({
  providers,
  selectedProviderId,
  onProviderChange,
  onStartDeviceLogin,
  onCancelDeviceLogin,
  isLoading,
  error,
  isInitializing = false,
  statusMessage,
  deviceLoginChallenge,
  isDeviceLoginPending = false,
}: LoginScreenProps): JSX.Element {
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isQrVisible, setIsQrVisible] = useState(readStoredQrPreference);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [hasOpenedSigninLink, setHasOpenedSigninLink] = useState(false);
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);

  const selectedProvider = providers.find((p) => p.idpId === selectedProviderId);
  const title = isInitializing ? t("auth.title.restoringSession") : t("auth.title.signIn");
  const subtitle = isInitializing ? t("auth.subtitle.checkingSavedAccounts") : t("app.description");
  const isDeviceLoginActive = Boolean(deviceLoginChallenge) || isDeviceLoginPending;
  const remainingMs = deviceLoginChallenge
    ? Math.max(0, deviceLoginChallenge.expiresAt - nowMs)
    : 0;
  const attemptId = deviceLoginChallenge?.attemptId ?? null;
  const userCode = deviceLoginChallenge?.userCode ?? "";

  const verificationHost = useMemo(() => {
    const uri = deviceLoginChallenge?.verificationUri;
    if (!uri) return "";
    try {
      return new URL(uri).host;
    } catch {
      return uri;
    }
  }, [deviceLoginChallenge?.verificationUri]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset per-attempt UI state whenever a new sign-in link is issued.
  useEffect(() => {
    setHasOpenedSigninLink(false);
    setIsCodeCopied(false);
    setQrCodeDataUrl(null);
  }, [attemptId]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  // Keep the expiry countdown ticking only while a link is on screen.
  useEffect(() => {
    if (!deviceLoginChallenge) return;

    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deviceLoginChallenge]);

  // The QR image is an optional fallback, so render it only when asked for.
  useEffect(() => {
    if (!isQrVisible || !deviceLoginChallenge) return;

    let cancelled = false;
    QRCode.toDataURL(deviceLoginChallenge.verificationUriComplete, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 8,
      color: {
        dark: "#07111f",
        light: "#ffffff",
      },
    }).then((dataUrl) => {
      if (!cancelled) {
        setQrCodeDataUrl(dataUrl);
      }
    }).catch(() => {
      if (!cancelled) {
        setQrCodeDataUrl(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isQrVisible, deviceLoginChallenge]);

  const handleProviderSelect = (providerId: string) => {
    onProviderChange(providerId);
    setIsDropdownOpen(false);
  };

  const handleToggleQr = () => {
    setIsQrVisible((current) => {
      const next = !current;
      writeStoredQrPreference(next);
      return next;
    });
  };

  const handleCopyUserCode = useCallback(async () => {
    if (!userCode) return;
    const copied = await copyTextToClipboard(userCode);
    if (!copied) return;
    setIsCodeCopied(true);
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setIsCodeCopied(false);
      copyFeedbackTimerRef.current = null;
    }, COPY_FEEDBACK_MS);
  }, [userCode]);

  return (
    <div className="login-screen">
      <div className="login-bg">
        <m.div
          className="login-bg-orb login-bg-orb--1"
          animate={{ x: [0, -40, 0], y: [0, 30, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <m.div
          className="login-bg-orb login-bg-orb--2"
          animate={{ x: [0, 50, 0], y: [0, -35, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
        />
        <m.div
          className="login-bg-orb login-bg-orb--3"
          animate={{ x: [0, 30, 0], y: [0, 20, 0], scale: [1, 0.9, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="login-bg-noise" />
      </div>

      <m.div className="login-content" {...dialogMotion}>
        {/* Brand */}
        <div className="login-brand">
          <div className="login-brand-mark">
            <OpenNowLogoMark className="opennow-logo-mark" />
          </div>
          <span className="login-brand-name">OpenNOW</span>
        </div>

        {/* Card */}
        <div className="login-card">
          <div className="login-card-header">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          {error && (
            <div className="login-error">
              <span className="login-error-dot" />
              {error}
            </div>
          )}

          {isInitializing && statusMessage && (
            <div className="login-status" role="status" aria-live="polite">
              <m.span
                className="login-status-dot"
                animate={{ opacity: [0.55, 1, 0.55], scale: [0.9, 1.12, 0.9] }}
                transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
              />
              {statusMessage}
            </div>
          )}

          <div className="login-field" ref={dropdownRef}>
            <label className="login-label">{t("auth.provider.label")}</label>
            <button
              className={`login-select ${isDropdownOpen ? "open" : ""}`}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              disabled={isLoading || isInitializing || isDeviceLoginActive}
              type="button"
            >
              <span className="login-select-text">
                {isInitializing
                  ? t("auth.provider.loading")
                  : selectedProvider?.displayName ?? t("auth.provider.select")}
              </span>
              <ChevronDown
                size={16}
                className={`login-select-chevron ${isDropdownOpen ? "rotated" : ""}`}
              />
            </button>

            <AnimatePresence>
              {isDropdownOpen && (
              <m.div
                className="login-dropdown"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14, ease: smoothEase }}
              >
                {providers.map((provider) => (
                  <button
                    key={provider.idpId}
                    className={`login-dropdown-item ${provider.idpId === selectedProviderId ? "selected" : ""}`}
                    onClick={() => handleProviderSelect(provider.idpId)}
                    type="button"
                  >
                    <span>{provider.displayName}</span>
                    {provider.idpId === selectedProviderId && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                      </svg>
                    )}
                  </button>
                ))}
              </m.div>
              )}
            </AnimatePresence>
          </div>

          {isDeviceLoginActive && (
            <div className="login-device-panel" role="status" aria-live="polite">
              {!deviceLoginChallenge ? (
                <div className="login-device-preparing">
                  <MotionSpinner className="login-motion-spinner" size={16} label={t("common.loading")} />
                  <div className="login-device-copy">
                    <div className="login-device-title">{t("auth.link.preparing")}</div>
                    <p>{t("auth.link.preparingDescription")}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="login-device-head">
                    <div className="login-device-copy">
                      <div className="login-device-title">{t("auth.link.title")}</div>
                      <p>{t("auth.link.description")}</p>
                    </div>
                    <span className="login-device-expiry">
                      {t("auth.link.expiresIn", { time: formatRemainingTime(remainingMs) })}
                    </span>
                  </div>

                  <a
                    className="login-button login-link-button"
                    href={deviceLoginChallenge.verificationUriComplete}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setHasOpenedSigninLink(true)}
                  >
                    <ExternalLink size={18} />
                    <span>
                      {hasOpenedSigninLink ? t("auth.link.openAgain") : t("auth.link.open")}
                    </span>
                  </a>

                  <AnimatePresence initial={false}>
                    {hasOpenedSigninLink && (
                      <m.div
                        className="login-status login-device-waiting"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.16, ease: smoothEase }}
                      >
                        <m.span
                          className="login-status-dot"
                          animate={{ opacity: [0.55, 1, 0.55], scale: [0.9, 1.12, 0.9] }}
                          transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
                        />
                        {t("auth.link.waiting")}
                      </m.div>
                    )}
                  </AnimatePresence>

                  <div className="login-device-code">
                    <span className="login-label">{t("auth.link.codeLabel")}</span>
                    <div className="login-device-code-row">
                      <code>{userCode}</code>
                      <button
                        className="login-copy-button"
                        onClick={() => void handleCopyUserCode()}
                        type="button"
                      >
                        {isCodeCopied ? <Check size={14} /> : <Copy size={14} />}
                        <span>{isCodeCopied ? t("auth.link.copied") : t("auth.link.copyCode")}</span>
                      </button>
                    </div>
                    <p className="login-device-hint">{t("auth.link.codeHint")}</p>
                  </div>

                  <div className="login-device-manual">
                    <span>{t("auth.link.manualUrl")}</span>
                    <a
                      href={deviceLoginChallenge.verificationUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={deviceLoginChallenge.verificationUri}
                    >
                      {verificationHost}
                    </a>
                  </div>

                  <AnimatePresence initial={false}>
                    {isQrVisible && (
                      <m.div
                        className="login-qr-panel"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18, ease: smoothEase }}
                      >
                        <div className="login-qr-code">
                          {qrCodeDataUrl ? (
                            <img src={qrCodeDataUrl} alt={t("auth.qr.alt")} />
                          ) : (
                            <MotionSpinner className="login-motion-spinner" size={16} label={t("common.loading")} />
                          )}
                        </div>
                        <div className="login-qr-copy">
                          <div className="login-qr-title">{t("auth.qr.title")}</div>
                          <p>{t("auth.qr.description")}</p>
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>

                  <button
                    className="login-ghost-button"
                    onClick={handleToggleQr}
                    type="button"
                  >
                    <QrCode size={15} />
                    <span>{isQrVisible ? t("auth.link.hideQr") : t("auth.link.showQr")}</span>
                  </button>
                </>
              )}

              <button
                className="login-secondary-button"
                onClick={onCancelDeviceLogin}
                type="button"
              >
                {t("auth.actions.cancelDeviceLogin")}
              </button>
            </div>
          )}

          <div className="login-actions">
            <button
              className={`login-button ${isLoading || isInitializing ? "loading" : ""}`}
              onClick={onStartDeviceLogin}
              disabled={isLoading || isInitializing || isDeviceLoginActive || !selectedProviderId}
              type="button"
            >
              {isLoading || isInitializing ? (
                <>
                  <MotionSpinner className="login-motion-spinner" size={16} label={t("common.loading")} />
                  <span>{isInitializing ? t("auth.actions.restoringSession") : t("auth.actions.connecting")}</span>
                </>
              ) : (
                <>
                  <Link2 size={18} />
                  <span>{t("auth.actions.signInWithLink")}</span>
                </>
              )}
            </button>
          </div>
        </div>

        <p className="login-footer">{t("app.tagline")}</p>
      </m.div>
    </div>
  );
}
