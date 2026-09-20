import type { ActiveSessionInfo, AuthUser, SavedAccount, SubscriptionInfo } from "@shared/gfn";
import { User, Timer, HardDrive, Check, Plus, PlayCircle, Square, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "motion/react";
import { useTranslation } from "../i18n";
import { MotionSpinner } from "./MotionSpinner";
import { panelSpring } from "./MotionProvider";

interface AccountMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  user: AuthUser | null;
  subscription: SubscriptionInfo | null;
  activeSession: ActiveSessionInfo | null;
  activeSessionGameTitle: string | null;
  isResumingSession: boolean;
  isTerminatingSession: boolean;
  onResumeSession: () => void;
  onTerminateSession: () => void;
  savedAccounts: SavedAccount[];
  onSwitchAccount: (userId: string) => void;
  onRemoveAccount: (userId: string) => void;
  onAddAccount: () => void;
  onLogoutAll: () => void;
}

function getTierDisplay(tier: string): { labelKey: string; className: string } {
  const t = tier.toUpperCase();
  if (t === "ULTIMATE") return { labelKey: "app.labels.ultimate", className: "tier-ultimate" };
  if (t === "PRIORITY" || t === "PERFORMANCE") return { labelKey: "app.labels.priority", className: "tier-priority" };
  return { labelKey: "app.labels.free", className: "tier-free" };
}

type DetailModalType = "time" | "storage" | null;

export function AccountMenu({
  open,
  onClose,
  anchorRef,
  user,
  subscription,
  activeSession,
  activeSessionGameTitle,
  isResumingSession,
  isTerminatingSession,
  onResumeSession,
  onTerminateSession,
  savedAccounts,
  onSwitchAccount,
  onRemoveAccount,
  onAddAccount,
  onLogoutAll,
}: AccountMenuProps): JSX.Element | null {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [detailModal, setDetailModal] = useState<DetailModalType>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  const formatHours = (value: number): string => {
    if (!Number.isFinite(value)) return "0";
    const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };
  const formatHoursAndMinutes = (value: number): string => {
    if (!Number.isFinite(value)) return "0m";
    const totalMinutes = Math.max(0, Math.round(value * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}m`;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  };
  const formatGb = (value: number): string => {
    if (!Number.isFinite(value)) return "0";
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  };
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  const toneByLeftRatio = (ratio: number): "good" | "warn" | "critical" => {
    if (ratio <= 0.15) return "critical";
    if (ratio <= 0.4) return "warn";
    return "good";
  };

  const tierInfo = user ? getTierDisplay(user.membershipTier) : null;
  const activeUserId = user?.userId ?? null;
  const activeSessionTitle = activeSessionGameTitle?.trim() || null;

  const timeTotal = subscription?.totalHours ?? 0;
  const timeLeft = subscription?.remainingHours ?? 0;
  const timeUsed = subscription?.usedHours ?? Math.max(timeTotal - timeLeft, 0);
  const timeUsedRatio = subscription && !subscription.isUnlimited && timeTotal > 0 ? clamp(timeUsed / timeTotal) : 0;
  const timeLeftRatio = subscription && !subscription.isUnlimited && timeTotal > 0 ? clamp(timeLeft / timeTotal) : 1;
  const timeTone: "good" | "warn" | "critical" = subscription?.isUnlimited ? "good" : toneByLeftRatio(timeLeftRatio);
  const timeLabel = subscription
    ? subscription.isUnlimited
      ? t("navbar.time.unlimitedTime")
      : t("app.units.durationLeft", { value: formatHoursAndMinutes(timeLeft) })
    : null;

  const storageTotal = subscription?.storageAddon?.sizeGb;
  const storageUsed = subscription?.storageAddon?.usedGb;
  const storageHasData = storageTotal !== undefined && storageUsed !== undefined;
  const storageLeft = storageHasData ? Math.max((storageTotal as number) - (storageUsed as number), 0) : undefined;
  const storageUsedRatio = storageHasData && (storageTotal as number) > 0 ? clamp((storageUsed as number) / (storageTotal as number)) : 0;
  const storageLeftRatio = storageHasData && (storageTotal as number) > 0 ? clamp((storageLeft ?? 0) / (storageTotal as number)) : 1;
  const storageTone = toneByLeftRatio(storageLeftRatio);
  const storageLabel = storageHasData
    ? t("app.units.gbLeft", { value: formatGb(storageLeft ?? 0) })
    : storageTotal !== undefined
      ? t("app.units.gbTotal", { value: formatGb(storageTotal) })
      : null;

  const detailModalNode = detailModal && subscription
    ? createPortal(
        <div className="navbar-modal-backdrop" onClick={() => setDetailModal(null)}>
          <div
            className="navbar-modal"
            role="dialog"
            aria-modal="true"
            aria-label={detailModal === "time" ? t("navbar.playtimeDetails") : t("navbar.storageDetails")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="navbar-modal-header">
              <h3>{detailModal === "time" ? t("navbar.playtimeDetails") : t("navbar.storageDetails")}</h3>
              <button type="button" className="navbar-modal-close" onClick={() => setDetailModal(null)}>
                ✕
              </button>
            </div>
            {detailModal === "time" && (
              <div className="navbar-modal-body">
                {!subscription.isUnlimited && timeTotal > 0 && (
                  <div className="navbar-meter">
                    <div className="navbar-meter-head">
                      <span>{t("navbar.time.timeUsage")}</span>
                      <strong>{t("navbar.time.used", { percent: `${Math.round(timeUsedRatio * 100)}%` })}</strong>
                    </div>
                    <div className="navbar-meter-track">
                      <span className={`navbar-meter-fill navbar-meter-fill--${timeTone}`} style={{ width: `${timeUsedRatio * 100}%` }} />
                    </div>
                    <div className="navbar-meter-legend">
                      <span>{t("app.units.hoursUsed", { value: formatHours(timeUsed) })}</span>
                      <span>{t("app.units.durationLeft", { value: formatHoursAndMinutes(timeLeft) })}</span>
                    </div>
                  </div>
                )}
                <div className="navbar-modal-row"><span>{t("navbar.time.tier")}</span><strong>{subscription.membershipTier}</strong></div>
                <div className="navbar-modal-row"><span>{t("navbar.time.timeLeft")}</span><strong>{subscription.isUnlimited ? t("app.labels.unlimited") : formatHoursAndMinutes(timeLeft)}</strong></div>
                <div className="navbar-modal-row"><span>{t("navbar.time.totalTime")}</span><strong>{subscription.isUnlimited ? t("app.labels.unlimited") : t("app.units.hours", { value: formatHours(timeTotal) })}</strong></div>
                <div className="navbar-modal-row"><span>{t("navbar.time.usedTime")}</span><strong>{t("app.units.hours", { value: formatHours(timeUsed) })}</strong></div>
              </div>
            )}
            {detailModal === "storage" && (
              <div className="navbar-modal-body">
                {storageHasData && (
                  <div className="navbar-meter">
                    <div className="navbar-meter-head">
                      <span>{t("navbar.storage.storageUsage")}</span>
                      <strong>{t("navbar.time.used", { percent: `${Math.round(storageUsedRatio * 100)}%` })}</strong>
                    </div>
                    <div className="navbar-meter-track">
                      <span className={`navbar-meter-fill navbar-meter-fill--${storageTone}`} style={{ width: `${storageUsedRatio * 100}%` }} />
                    </div>
                    <div className="navbar-meter-legend">
                      <span>{t("app.units.gbUsed", { value: formatGb(storageUsed ?? 0) })}</span>
                      <span>{t("app.units.gbLeft", { value: formatGb(storageLeft ?? 0) })}</span>
                    </div>
                  </div>
                )}
                <div className="navbar-modal-row"><span>{t("navbar.storage.storageLeft")}</span><strong>{storageLeft !== undefined ? t("app.units.gb", { value: formatGb(storageLeft) }) : t("navbar.storage.notAvailable")}</strong></div>
                <div className="navbar-modal-row"><span>{t("navbar.storage.storageTotal")}</span><strong>{storageTotal !== undefined ? t("app.units.gb", { value: formatGb(storageTotal) }) : t("navbar.storage.notAvailable")}</strong></div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  if (!user) return detailModalNode;

  return (
    <>
      <AnimatePresence>
        {open && (
          <m.div
            ref={menuRef}
            className="account-menu"
            role="menu"
            aria-label={t("auth.accounts.switchAccount")}
            initial={{ opacity: 0, x: -10, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.98 }}
            transition={panelSpring}
          >
            <div className="account-menu-identity">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="account-menu-avatar" />
              ) : (
                <div className="account-menu-avatar account-menu-avatar--fallback">
                  <User size={18} />
                </div>
              )}
              <div className="account-menu-identity-info">
                <span className="account-menu-name">{user.displayName}</span>
                {tierInfo && <span className={`account-menu-tier ${tierInfo.className}`}>{t(tierInfo.labelKey)}</span>}
              </div>
            </div>

            {(timeLabel || storageLabel) && (
              <div className="account-menu-stats">
                {timeLabel && (
                  <button type="button" className={`account-menu-stat account-menu-stat--${timeTone}`} onClick={() => setDetailModal("time")}>
                    <Timer size={15} />
                    <span>{timeLabel}</span>
                    <ChevronRight size={13} className="account-menu-stat-chevron" />
                  </button>
                )}
                {storageLabel && (
                  <button type="button" className={`account-menu-stat account-menu-stat--${storageTone}`} onClick={() => setDetailModal("storage")}>
                    <HardDrive size={15} />
                    <span>{storageLabel}</span>
                    <ChevronRight size={13} className="account-menu-stat-chevron" />
                  </button>
                )}
              </div>
            )}

            {activeSession && (
              <div className="account-menu-session">
                <button
                  type="button"
                  className={`account-menu-session-btn account-menu-session-btn--resume${isResumingSession ? " is-loading" : ""}`}
                  onClick={onResumeSession}
                  disabled={isResumingSession || isTerminatingSession || !activeSession.serverIp}
                >
                  {isResumingSession ? <MotionSpinner size={14} label="Resuming" /> : <PlayCircle size={15} />}
                  <span>{t("app.actions.resume")}{activeSessionTitle ? ` · ${activeSessionTitle}` : ""}</span>
                </button>
                <button
                  type="button"
                  className={`account-menu-session-btn account-menu-session-btn--stop${isTerminatingSession ? " is-loading" : ""}`}
                  onClick={onTerminateSession}
                  disabled={isResumingSession || isTerminatingSession}
                  aria-label={t("session.terminate")}
                >
                  {isTerminatingSession ? <MotionSpinner size={14} label="Ending" /> : <Square size={12} />}
                </button>
              </div>
            )}

            {savedAccounts.length > 0 && (
              <>
                <div className="account-menu-divider" aria-hidden="true" />
                <div className="account-menu-section-label">{t("auth.accounts.switchAccount")}</div>
                <ul className="account-menu-list">
                  {savedAccounts.map((account) => {
                    const accountTierInfo = getTierDisplay(account.membershipTier);
                    const isActive = activeUserId === account.userId;
                    const canRemove = !isActive && savedAccounts.length > 1;
                    return (
                      <li key={account.userId} className={`account-menu-item${isActive ? " active" : ""}`}>
                        <button
                          type="button"
                          className="account-menu-item-main"
                          onClick={() => {
                            if (!isActive) onSwitchAccount(account.userId);
                            onClose();
                          }}
                          disabled={isActive}
                        >
                          {account.avatarUrl ? (
                            <img src={account.avatarUrl} alt="" className="account-menu-item-avatar" />
                          ) : (
                            <div className="account-menu-item-avatar account-menu-avatar--fallback">
                              <User size={13} />
                            </div>
                          )}
                          <div className="account-menu-item-info">
                            <span className="account-menu-item-name">{account.displayName}</span>
                            {account.email && <span className="account-menu-item-email">{account.email}</span>}
                          </div>
                          <span className={`account-menu-item-tier ${accountTierInfo.className}`}>{t(accountTierInfo.labelKey)}</span>
                          {isActive && <Check size={14} className="account-menu-item-check" />}
                        </button>
                        {canRemove && (
                          <button
                            type="button"
                            className="account-menu-item-remove"
                            aria-label={t("auth.accounts.removeNamedAccount", { name: account.displayName })}
                            onClick={() => {
                              onClose();
                              onRemoveAccount(account.userId);
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className="account-menu-divider" aria-hidden="true" />
            <button
              type="button"
              className="account-menu-action"
              onClick={() => {
                onAddAccount();
                onClose();
              }}
            >
              <Plus size={15} />
              <span>{t("auth.accounts.addAccount")}</span>
            </button>
            <button
              type="button"
              className="account-menu-action account-menu-action--danger"
              onClick={() => {
                onClose();
                onLogoutAll();
              }}
            >
              {t("auth.accounts.signOutAllAccounts")}
            </button>
          </m.div>
        )}
      </AnimatePresence>
      {detailModalNode}
    </>
  );
}
