import { Cpu, Gauge, Monitor, Radio, Wifi, X, XCircle, Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { JSX, Ref } from "react";
import { AnimatePresence, m } from "motion/react";
import {
  getPreferredSessionAdMediaUrl,
  getSessionAdItems,
  getSessionAdMessage,
  isSessionAdsRequired,
  isSessionQueuePaused,
} from "@shared/gfn";
import type { SessionAdInfo, SessionAdState } from "@shared/gfn";
import { getStoreDisplayName, getStoreIconComponent } from "./GameCard";
import { QueueAdPreview, type QueueAdPlaybackEvent, type QueueAdPreviewHandle } from "./QueueAdPreview";
import { LazyShaderAtmosphere } from "./LazyShaderAtmosphere";
import { useTranslation } from "../i18n";

type TranslateFunction = typeof import("../i18n").t;

const launchStages = [
  { id: "queue", icon: Radio },
  { id: "setup", icon: Cpu },
  { id: "connecting", icon: Wifi },
  { id: "ready", icon: Monitor },
] as const;

export interface StreamLoadingProps {
  gameTitle: string;
  gameCover?: string;
  platformStore?: string;
  status: "queue" | "setup" | "starting" | "connecting";
  queuePosition?: number;
  estimatedWait?: string;
  adState?: SessionAdState;
  activeAd?: SessionAdInfo;
  activeAdMediaUrl?: string;
  error?: {
    title: string;
    description: string;
    code?: string;
    actionLabel?: string;
  };
  onAdPlaybackEvent?: (event: QueueAdPlaybackEvent, adId: string) => void;
  adPreviewRef?: Ref<QueueAdPreviewHandle>;
  onErrorAction?: () => void;
  onCancel: () => void;
}

const stageLabelKey: Record<(typeof launchStages)[number]["id"], string> = {
  queue: "streamLoading.steps.queue",
  setup: "streamLoading.steps.setup",
  connecting: "streamLoading.steps.connect",
  ready: "streamLoading.steps.ready",
};

function safeStageLabel(t: TranslateFunction, id: (typeof launchStages)[number]["id"]): string {
  const fallback: Record<string, string> = {
    queue: "Queue",
    setup: "Setting up",
    connecting: "Connecting",
    ready: "Ready",
  };
  const key = stageLabelKey[id];
  const translated = t(key);
  return translated === key ? fallback[id] : translated;
}

function getStatusMessage(
  t: TranslateFunction,
  status: StreamLoadingProps["status"],
  queuePosition?: number,
  adState?: SessionAdState,
  isError = false,
): string {
  if (isError) return t("streamLoading.status.gameLaunchFailed");
  if (isSessionQueuePaused(adState)) return t("streamLoading.status.queuePaused");

  switch (status) {
    case "queue":
      return queuePosition
        ? t("streamLoading.status.positionInQueue", { position: queuePosition })
        : t("streamLoading.status.waitingInQueue");
    case "setup":
      return t("streamLoading.status.settingUpRig");
    case "starting":
      return t("streamLoading.status.startingStream");
    case "connecting":
      return t("streamLoading.status.connectingToServer");
  }
}

function getPhaseDetail(t: TranslateFunction, status: StreamLoadingProps["status"]): string {
  switch (status) {
    case "queue":
      return t("streamLoading.cozy.queue");
    case "setup":
      return t("streamLoading.cozy.setup");
    case "starting":
      return t("streamLoading.cozy.starting");
    case "connecting":
      return t("streamLoading.cozy.connecting");
  }
}

function getActiveStage(status: StreamLoadingProps["status"]): number {
  if (status === "queue") return 0;
  if (status === "setup") return 1;
  return 2;
}

function formatWaitTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function getAdSummary(t: TranslateFunction, adState?: SessionAdState): string | null {
  if (!isSessionAdsRequired(adState)) return null;
  const message = getSessionAdMessage(adState);
  if (message) return message;
  if (isSessionQueuePaused(adState)) return t("streamLoading.ads.resumeToStayInQueue");
  const ads = getSessionAdItems(adState);
  return ads.length > 0
    ? t("streamLoading.ads.availableForProgression", { count: ads.length })
    : t("streamLoading.ads.playbackRequired");
}

export function StreamLoading({
  gameTitle,
  gameCover,
  platformStore,
  status,
  queuePosition,
  estimatedWait,
  adState,
  activeAd,
  activeAdMediaUrl,
  error,
  onAdPlaybackEvent,
  adPreviewRef,
  onErrorAction,
  onCancel,
}: StreamLoadingProps): JSX.Element {
  const { t } = useTranslation();
  const [startedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const hasError = Boolean(error);
  const statusMessage = getStatusMessage(t, status, queuePosition, adState, hasError);
  const platformName = platformStore ? getStoreDisplayName(platformStore) : "";
  const PlatformIcon = platformStore ? getStoreIconComponent(platformStore) : null;
  const adSummary = getAdSummary(t, adState);
  const cachedAdMediaUrl = activeAdMediaUrl ?? getPreferredSessionAdMediaUrl(activeAd);
  const activeStage = getActiveStage(status);
  const isQueue = status === "queue";
  const isPaused = isSessionQueuePaused(adState);
  const hasAd = Boolean(activeAd && cachedAdMediaUrl);

  // Overall progress across the four launch stages (approximate, keeps the ring
  // moving even when the queue position is unknown).
  const stageProgress = hasError ? 0 : Math.min(1, (activeStage + 0.5) / launchStages.length);
  const ringCircumference = 2 * Math.PI * 52;

  useEffect(() => {
    if (hasError) return undefined;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasError, startedAt]);

  return (
    <div className={`gload${hasError ? " gload--error" : ""}`}>
      {/* Full-bleed blurred cover backdrop */}
      {gameCover ? (
        <div className="gload-bg" style={{ backgroundImage: `url(${gameCover})` }} />
      ) : (
        <div className="gload-bg gload-bg--empty" />
      )}
      {!hasError && (
        <LazyShaderAtmosphere variant={isQueue ? "queue" : "connecting"} className="gload-shader" />
      )}
      <div className="gload-vignette" />

      <m.div
        className="gload-card"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="gload-card-glow" aria-hidden="true" />

        <div className="gload-hero">
          <div className="gload-cover">
            {gameCover ? (
              <img src={gameCover} alt="" className="gload-cover-img" />
            ) : (
              <div className="gload-cover-empty"><Monitor size={30} /></div>
            )}
            {!hasError && (
              <m.span
                className="gload-cover-sheen"
                aria-hidden="true"
                animate={{ x: ["-120%", "220%"] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.4 }}
              />
            )}
          </div>

          <div className="gload-hero-meta">
            <span className={`gload-eyebrow${hasError ? " gload-eyebrow--error" : ""}`}>
              {hasError ? t("streamLoading.labels.launchError") : t("streamLoading.labels.nowLoading")}
            </span>
            <h1 className="gload-title" title={gameTitle}>{gameTitle}</h1>
            {PlatformIcon && (
              <div className="gload-platform" title={platformName}>
                <span className="gload-platform-icon"><PlatformIcon /></span>
                <span>{platformName}</span>
              </div>
            )}

            <div className={`gload-status${hasError ? " gload-status--error" : ""}`}>
              {hasError ? (
                <XCircle size={18} className="gload-status-icon" />
              ) : (
                <m.span
                  className="gload-live-dot"
                  aria-hidden="true"
                  animate={{ opacity: [0.5, 1, 0.5], scale: [0.85, 1.15, 0.85] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              <div className="gload-status-text">
                <p className="gload-message" role="status" aria-live="polite">{statusMessage}</p>
                {!hasError && <p className="gload-detail">{getPhaseDetail(t, status)}</p>}
                {hasError && error && (
                  <>
                    <p className="gload-error-desc">{error.description}</p>
                    {error.code && <span className="gload-error-code">{error.code}</span>}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Progress ring / queue counter */}
          {!hasError && (
            <div className="gload-ring" aria-hidden="true">
              <svg viewBox="0 0 120 120" className="gload-ring-svg">
                <circle className="gload-ring-track" cx="60" cy="60" r="52" />
                <m.circle
                  className="gload-ring-fill"
                  cx="60"
                  cy="60"
                  r="52"
                  strokeDasharray={ringCircumference}
                  initial={{ strokeDashoffset: ringCircumference }}
                  animate={{ strokeDashoffset: ringCircumference * (1 - stageProgress) }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                />
              </svg>
              <div className="gload-ring-center">
                {isQueue && queuePosition ? (
                  <>
                    <span className="gload-ring-num">#{queuePosition}</span>
                    <span className="gload-ring-lbl">{t("streamLoading.telemetry.queuePosition")}</span>
                  </>
                ) : (
                  <>
                    <span className="gload-ring-num">{Math.round(stageProgress * 100)}%</span>
                    <span className="gload-ring-lbl">{safeStageLabel(t, launchStages[Math.min(activeStage, 3)].id)}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Stage stepper */}
        {!hasError && (
          <div className="gload-steps" aria-label={t("streamLoading.labels.launchProgress")}>
            {launchStages.map((stage, index) => {
              const StageIcon = stage.icon;
              const state = index < activeStage ? "completed" : index === activeStage ? "active" : "pending";
              return (
                <div className={`gload-step gload-step--${state}`} key={stage.id}>
                  <m.span
                    className="gload-step-icon"
                    animate={state === "active" ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                    transition={state === "active"
                      ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0.2 }}
                  >
                    {state === "completed" ? <Check size={16} /> : <StageIcon size={16} />}
                  </m.span>
                  <span className="gload-step-name">{safeStageLabel(t, stage.id)}</span>
                  {index < launchStages.length - 1 && (
                    <span className={`gload-step-line${index < activeStage ? " gload-step-line--done" : ""}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Telemetry chips */}
        {!hasError && (
          <div className="gload-facts">
            <div className="gload-fact">
              <Radio size={15} className="gload-fact-icon" />
              <div className="gload-fact-copy">
                <small>{t("streamLoading.telemetry.queuePosition")}</small>
                <strong>{isQueue && queuePosition ? `#${queuePosition}` : isQueue ? t("streamLoading.telemetry.calculating") : t("streamLoading.telemetry.cleared")}</strong>
              </div>
            </div>
            <div className="gload-fact">
              <Gauge size={15} className="gload-fact-icon" />
              <div className="gload-fact-copy">
                <small>{t("streamLoading.telemetry.elapsed")}</small>
                <strong>{formatWaitTime(elapsedSeconds)}</strong>
              </div>
            </div>
            {estimatedWait && isQueue ? (
              <div className="gload-fact">
                <Wifi size={15} className="gload-fact-icon" />
                <div className="gload-fact-copy">
                  <small>{t("streamLoading.cozy.next")}</small>
                  <strong>~{estimatedWait}</strong>
                </div>
              </div>
            ) : (
              <div className="gload-fact">
                <Wifi size={15} className="gload-fact-icon" />
                <div className="gload-fact-copy">
                  <small>{t("streamLoading.cozy.next")}</small>
                  <strong>{safeStageLabel(t, launchStages[Math.min(activeStage + 1, 3)].id)}</strong>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ad preview */}
        <AnimatePresence>
          {!hasError && hasAd && (
            <m.div
              className={`gload-ad${isPaused ? " gload-ad--paused" : ""}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="gload-ad-copy">
                <span className="gload-ad-chip">{t("streamLoading.labels.adQueue")}</span>
                {adSummary && <p className="gload-ad-message">{adSummary}</p>}
              </div>
              <div className="gload-ad-media">
                <QueueAdPreview
                  ref={adPreviewRef}
                  mediaUrl={cachedAdMediaUrl ?? ""}
                  title={activeAd!.title}
                  onPlaybackEvent={(event) => onAdPlaybackEvent?.(event, activeAd!.adId)}
                />
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="gload-actions">
          {hasError && error?.actionLabel && onErrorAction && (
            <button type="button" className="gload-btn gload-btn--primary" onClick={onErrorAction}>
              <span>{error.actionLabel}</span>
            </button>
          )}
          <button
            type="button"
            className="gload-btn gload-btn--ghost"
            onClick={onCancel}
            aria-label={t("streamLoading.actions.cancelLoading")}
          >
            <X size={15} />
            <span>{hasError ? t("app.actions.close") : t("app.actions.cancel")}</span>
          </button>
        </div>
      </m.div>
    </div>
  );
}
