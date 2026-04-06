import { action, DidReceiveSettingsEvent, SingletonAction, WillAppearEvent, streamDeck, KeyDownEvent, KeyUpEvent } from "@elgato/streamdeck";
import WebSocket from "ws";
import { exec } from "child_process";

@action({ UUID: "com.ruverq.pomotroid.timer" })
export class PomotroidTimer extends SingletonAction<PomotroidTimerSettings> {

    private ws?: WebSocket;
    private updateInterval?: NodeJS.Timeout;

    override onWillAppear(ev: WillAppearEvent<PomotroidTimerSettings>): void {
        this.connectWebSocket(ev);
        this.renderTimer(ev.action, ev.payload.settings).catch(console.error);
    }

    private holdTimer?: NodeJS.Timeout;
    private holdThresholdMs = 600;
    private holdDetected = false;
    override onKeyDown(ev: KeyDownEvent<PomotroidTimerSettings>): void {
        this.holdDetected = false;
        this.holdTimer = setTimeout(() => {
        this.holdDetected = true;
        this.onHold(ev);
        }, this.holdThresholdMs);
        
    }

    override onKeyUp(ev: KeyUpEvent<PomotroidTimerSettings>): Promise<void> | void {
        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
            this.holdTimer = undefined;
        }

        if (!this.holdDetected) {
            // This was a normal tap/click
            this.onTap(ev);
        }
    }

    private onTap(ev: KeyUpEvent<PomotroidTimerSettings>): void {
        exec(`powershell -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^({F1})')"`);
    }


    private onHold(ev: KeyDownEvent<PomotroidTimerSettings>): void {
        exec(`powershell -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^({F4})')"`);
    }

    private connectWebSocket(ev: WillAppearEvent<PomotroidTimerSettings> | KeyDownEvent<PomotroidTimerSettings>): void {

        this.ws?.close();

        const { settings } = ev.payload;

        this.ws = new WebSocket("ws://127.0.0.1:" + settings.pomotroidWebSocketPort + "/ws");
        this.ws.onopen = () => {
            console.log("Connected To Pomotroid");
        
        this.ws?.send(JSON.stringify({ type: "getState" }), err => {
            if (err) console.error("send failed", err);
            else console.log("getState sent");
        });
        }

        this.ws.onmessage = async (event) => {
            console.log("bruh")
            
            const data = JSON.parse(event.data.toString());
            console.log("got" + event.data)
            console.log("type" + data.type)

            switch (data.type) {
                case "paused":
                    settings.elapsedSecs = parseInt(data.payload.elapsed_secs, 10);
                    settings.isPaused = true;
                    settings.isRunning = false;
                    await ev.action.setSettings(settings);
                    this.clearTimer();
                    await this.renderTimer(ev.action, settings);
                    break;
                case "resumed":
                    settings.isPaused = false;
                    settings.elapsedSecs = parseInt(data.payload.elapsed_secs, 10);
                    await ev.action.setSettings(settings);
                    await this.renderTimer(ev.action, settings);
                    this.startTimer(ev);
                    break;
                case "roundChange":
                    settings.elapsedSecs = parseInt(data.payload.elapsed_secs, 10);
                    settings.totalSecs = parseInt(data.payload.total_secs, 10);
                    settings.isRunning = data.payload.is_running;
                    settings.round_type = data.payload.round_type;
                    await ev.action.setSettings(settings);
                    await this.renderTimer(ev.action, settings);
                    if (settings.isRunning) {
                        this.startTimer(ev);
                    }
                    break;
                case "started":
                    settings.totalSecs = parseInt(data.payload.total_secs, 10);
                    settings.elapsedSecs = 0;
                    console.log("???")
                    await ev.action.setSettings(settings);
                    await this.renderTimer(ev.action, settings);
                    this.startTimer(ev);
                    break;
                case "reset":
                    settings.round_type = "work";
                    settings.elapsedSecs = 0;
                    await ev.action.setSettings(settings);
                    this.clearTimer();
                    await this.renderTimer(ev.action, settings);
                    break;

            }


        }

        this.ws.onerror = (error) => {
            console.error("WebSocket error:", error);
        };
    }

    private startTimer(ev: WillAppearEvent<PomotroidTimerSettings> | KeyDownEvent<PomotroidTimerSettings>): void{
        console.log("started timer")
        const { settings } = ev.payload;
        if(this.updateInterval !== undefined) {
            console.error("Interval is already running, use clearInterval before it");
            return;
        }

        settings.elapsedSecs = settings.elapsedSecs ?? 0;
        settings.totalSecs = settings.totalSecs ?? 0;
        this.renderTimer(ev.action, settings).catch(console.error);

        this.updateInterval = setInterval(async () => {
            settings.elapsedSecs = (settings.elapsedSecs ?? 0) + 1;
            settings.totalSecs = settings.totalSecs ?? 0;
            await ev.action.setSettings(settings);
            await this.renderTimer(ev.action, settings);
        }, 1000); // 1000ms = 1 second    

    }

    private async renderTimer(action: { setImage(image?: string): Promise<void>; setTitle(title?: string): Promise<void>; }, settings: PomotroidTimerSettings): Promise<void> {
        const totalSecs = settings.totalSecs ?? 0;
        const elapsedSecs = Math.min(settings.elapsedSecs ?? 0, totalSecs);
        const remaining = Math.max(0, totalSecs - elapsedSecs);
        const remainingFraction = totalSecs > 0 ? Math.max(0, Math.min(1, remaining / totalSecs)) : 0;
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;

        const svg = this.buildTimerSvg(remainingFraction, settings);
        await action.setImage(svg);
        await action.setTitle(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }

    private buildTimerSvg(progress: number, settings: PomotroidTimerSettings): string {
        const theme = this.getThemeForSettings(settings);
        const radius = 52;
        const circumference = 2 * Math.PI * radius;
        const dashOffset = circumference * (1 - progress);
        const icon = settings.isPaused ? this.buildPauseIcon(theme.icon) : "";

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">
  <rect width="144" height="144" rx="28" fill="${theme.background}" />
  <circle cx="72" cy="72" r="60" fill="none" stroke="${theme.track}" stroke-width="12" opacity="0.45" />
  <circle cx="72" cy="72" r="${radius}" fill="none" stroke="${theme.progress}" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}"
          transform="rotate(-90 72 72)" />
  <circle cx="72" cy="72" r="42" fill="${theme.inner}" />
  <circle cx="72" cy="72" r="34" fill="${theme.center}" opacity="0.75" />
  ${icon}
</svg>`;

        const encoded = Buffer.from(svg).toString("base64");
        return `data:image/svg+xml;base64,${encoded}`;
    }

    private buildPauseIcon(color: string): string {
        return `
  <g fill="${color}" transform="translate(52 52)">
    <rect x="0" y="0" width="12" height="40" rx="3" />
    <rect x="28" y="0" width="12" height="40" rx="3" />
  </g>`;
    }

    private getThemeForSettings(settings: PomotroidTimerSettings): { background: string; track: string; progress: string; inner: string; center: string; icon: string } {
        if (settings.isPaused) {
            return {
                background: "#11131A",
                track: "#4D5568",
                progress: "#9CA3AF",
                inner: "#11131A",
                center: "#1F2937",
                icon: "#F8FAFC",
            };
        }

        switch (settings.round_type?.toLowerCase()) {
            case "work":
                return {
                    background: "#10151D",
                    track: "#3F2B2B",
                    progress: "#EA6B5E",
                    inner: "#11131A",
                    center: "#141A24",
                    icon: "#F8FAFC",
                };
            case "short-break":
                return {
                    background: "#0F172A",
                    track: "#2a3630",
                    progress: "#6fc080",
                    inner: "#0F172A",
                    center: "#111827",
                    icon: "#F8FAFC",
                };
            case "long-break":
                return {
                    background: "#111826",
                    track: "#374151",
                    progress: "#38BDF8",
                    inner: "#0F172A",
                    center: "#111827",
                    icon: "#F8FAFC",
                };
            default:
                return {
                    background: "#11131A",
                    track: "#374151",
                    progress: "#F59E0B",
                    inner: "#11131A",
                    center: "#111827",
                    icon: "#F8FAFC",
                };
        }
    }

    private clearTimer(){
        if(this.updateInterval === undefined) {
            return;
        }

        console.log("cleared timer")
        clearInterval(this.updateInterval);
        this.updateInterval = undefined;
    }

    override onWillDisappear() {
        this.clearTimer();
        this.ws?.close();
    }

}

type PomotroidTimerSettings = {
    pomotroidWebSocketPort?: string;
    elapsedSecs?: number;
    round_type?: string;
    totalSecs?: number;
    isRunning?: boolean;
    isPaused?: boolean;
}

    