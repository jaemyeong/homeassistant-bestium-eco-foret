
/* 이름은 프레임에서 읽은 주소 그대로. 어느 주소가 어느 방인지는 관측된 적이 없다. */
const LIGHTS = [
  { name: "조명 1", addr: "0x19 · 채널 1" },
  { name: "조명 2", addr: "0x19 · 채널 2" },
  { name: "조명 3", addr: "0x19 · 채널 3" },
];

const ZONES = [
  { name: "Zone 1", addr: "0x18 · 존 1", current: 29, obs: "confirmed" },
  { name: "Zone 2", addr: "0x18 · 존 2", current: 29, obs: "guess" },
  { name: "Zone 3", addr: "0x18 · 존 3", current: 31, obs: "guess" },
  { name: "Zone 4", addr: "0x18 · 존 4", current: null, obs: "guess" },
];

/* 실제 캡처에서 읽은 프레임. 구조는 f7 · 길이 · 01 · 계열 · 데이터 · XOR 체크섬 · ee. */
const FRAMES = [
  { series: "조명 0x19", hex: "f7 0b 01 19 01 40 10 00 00 b5 ee", decoded: "조명 상태 프레임 · 채널 1–3", elapsed: "+0.42초", known: true },
  { series: "난방 0x18", hex: "f7 0b 01 18 01 46 10 00 00 b2 ee", decoded: "난방 상태 프레임 · 존 1", elapsed: "+0.91초", known: true },
  { series: "가스 0x1b", hex: "f7 0b 01 1b 01 43 11 00 00 b5 ee", decoded: "가스 상태 프레임", elapsed: "+1.34초", known: true },
  { series: "가스 0x1b", hex: "f7 0d 01 1b 04 43 11 00 04 00 00 b2 ee", decoded: "가스 상태 프레임 · 긴 형태", elapsed: "+1.88초", known: true },
  { series: "승강기 0x34", hex: "f7 0d 01 34 01 41 10 00 00 00 00 9f ee", decoded: "승강기 상태 프레임 · 층·방향은 해독 대기", elapsed: "+2.31초", known: true },
  { series: "콘센트 0x1f", hex: "f7 0b 01 1f 01 40 10 00 00 b3 ee", decoded: "조회 응답 · 해석 없음", elapsed: "+2.77초", known: false },
  { series: "환기 0x2b", hex: "f7 0b 01 2b 01 40 11 00 00 86 ee", decoded: "조회 응답 · 해석 없음", elapsed: "+3.05초", known: false },
  { series: "모호 0x2a", hex: "f7 0e 01 2a 01 40 10 00 19 00 1b 04 85 ee", decoded: "0x2a 계열 · 해석이 둘 이상", elapsed: "+3.42초", known: false },
];

const STATE_PREVIEWS = [
  { id: "ready", label: "준비됨" },
  { id: "off", label: "수집 꺼짐" },
  { id: "quiet", label: "버스 조용" },
  { id: "doorbell", label: "현관 호출" },
];

class Component extends DCLogic {
  state = {
    send: "ready",
    progress: 0,
    detail: "",
    remaining: "",
    pendingKey: null,
    reqText: "",
    lights: [true, false, false],
    zones: [
      { on: true, target: 23 },
      { on: false, target: 23 },
      { on: false, target: 23 },
      { on: false, target: 23 },
    ],
    hex: "f7 0b 01 19 02 40 11 01 00 b6 ee",
    labStep: 0,
    capturing: false,
  };

  componentWillUnmount() {
    clearInterval(this._timer);
  }

  now() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /* One write attempt: leaves the socket, then waits for a matching state frame.
     Nothing is called a failure — the wait either observes or it does not. */
  write({ key, label, reqText, confirms, apply }) {
    if (this.state.send === "sending") return;
    if (this.state.send === "off") return;
    clearInterval(this._timer);
    const total = Number(this.props.observeSeconds ?? 10);
    const started = Date.now();
    this.setState({
      send: "sending",
      progress: 0,
      pendingKey: key,
      reqText,
      detail: `${label} · ${this.now()}에 소켓으로 씀`,
      remaining: `${total.toFixed(1)}초 남음`,
    });
    this._timer = setInterval(() => {
      const el = (Date.now() - started) / 1000;
      if (el >= total) {
        clearInterval(this._timer);
        if (confirms && apply) apply();
        this.setState({
          send: confirms ? "confirmed" : "unconfirmed",
          progress: 100,
          remaining: "0.0초 남음",
          detail: confirms
            ? `${label} · ${this.now()} 상태 프레임으로 확인`
            : `${label} · ${total}초 동안 요청한 상태를 관측하지 못함`,
        });
        return;
      }
      this.setState({ progress: (el / total) * 100, remaining: `${(total - el).toFixed(1)}초 남음` });
    }, 100);
  }

  lightRows(locked) {
    return LIGHTS.map((l, i) => {
      const key = `light-${i}`;
      const on = this.state.lights[i];
      const pending = this.state.pendingKey === key && this.state.send === "sending";
      const unconf = this.state.pendingKey === key && this.state.send === "unconfirmed";
      return {
        name: l.name,
        addr: l.addr,
        on,
        icon: on ? "lightbulb" : "lightbulb-outline",
        color: on ? "var(--state-light-active-color)" : "var(--state-inactive-color)",
        state: pending
          ? `요청 ${this.state.reqText} · 관측 중`
          : unconf
            ? `요청 ${this.state.reqText} · 미관측`
            : on
              ? "켜짐"
              : "꺼짐",
        disabled: locked,
        toggle: () => {
          const next = !on;
          this.write({
            key,
            label: `${l.name} · ${next ? "켜기" : "끄기"}`,
            reqText: next ? "켜짐" : "꺼짐",
            confirms: true,
            apply: () => this.setState((s) => ({ lights: s.lights.map((v, j) => (j === i ? next : v)) })),
          });
        },
      };
    });
  }

  zoneRows(obs, locked) {
    return ZONES.map((z, i) => ({ z, i }))
      .filter(({ z }) => z.obs === obs)
      .map(({ z, i }) => {
        const key = `zone-${i}`;
        const cur = this.state.zones[i];
        const confirms = z.obs === "confirmed";
        const pending = this.state.pendingKey === key && this.state.send === "sending";
        const unconf = this.state.pendingKey === key && this.state.send === "unconfirmed";
        const stateLine = pending
          ? `요청 ${this.state.reqText} · 관측 중`
          : unconf
            ? `요청 ${this.state.reqText} · 미관측`
            : z.current == null
              ? "상태 프레임을 아직 보지 못했습니다"
              : cur.on
                ? `난방 ${cur.target}°C · 13:20:44 관측`
                : `꺼짐 · 13:20:44 관측`;
        return {
          name: z.name,
          addr: z.addr,
          hasCurrent: z.current != null,
          noCurrent: z.current == null,
          currentText: z.current != null ? `${z.current}°C` : "",
          target: cur.target,
          on: cur.on,
          off: !cur.on,
          color: cur.on ? "var(--state-climate-heat-color)" : z.current == null ? "var(--state-unavailable-color)" : "var(--state-inactive-color)",
          stateLine,
          disabled: locked,
          setTarget: (v) =>
            this.write({
              key,
              label: `${z.name} · 목표 ${v}°C`,
              reqText: `${v}°C`,
              confirms,
              apply: () => this.setState((s) => ({ zones: s.zones.map((q, j) => (j === i ? { ...q, target: v } : q)) })),
            }),
          turnOn: () =>
            this.write({
              key,
              label: `${z.name} · 켜기`,
              reqText: "켜짐",
              confirms,
              apply: () => this.setState((s) => ({ zones: s.zones.map((q, j) => (j === i ? { ...q, on: true } : q)) })),
            }),
          turnOff: () =>
            this.write({
              key,
              label: `${z.name} · 끄기`,
              reqText: "꺼짐",
              confirms,
              apply: () => this.setState((s) => ({ zones: s.zones.map((q, j) => (j === i ? { ...q, on: false } : q)) })),
            }),
        };
      });
  }

  /* The lab never claims a result the bus did not show: step 3 reports what left
     the socket, not what the wallpad did with it. */
  labVals() {
    const raw = (this.state.hex || "").replace(/\s+/g, "");
    const bytes = Math.floor(raw.length / 2);
    const hexOnly = /^[0-9a-fA-F]*$/.test(raw);
    const valid = hexOnly && raw.length > 0 && raw.length % 2 === 0 && bytes >= 1 && bytes <= 256;
    const step = this.state.labStep;
    const grouped = (raw.match(/.{1,2}/g) || []).join(" ").toLowerCase();
    const active = (n) => (step >= n ? "color-mix(in srgb,var(--primary-color) 12%,transparent)" : "var(--primary-background-color)");
    const dot = (n) => (step >= n ? "var(--primary-color)" : "var(--disabled-color)");
    const lenText = !hexOnly
      ? "16진수만 넣을 수 있습니다"
      : raw.length % 2 === 1
        ? "짝수 자리가 아닙니다"
        : bytes === 0
          ? "1바이트 이상 필요합니다"
          : bytes > 256
            ? "256바이트를 넘었습니다"
            : `${bytes}바이트`;
    const panels = [
      { label: "입력한 바이트", note: "XOR 체크섬과 f7·ee 경계를 계산하지 않습니다. 입력한 바이트를 그대로 보냅니다." },
      { label: `미리보기 · ${bytes}바이트`, note: "이 바이트가 그대로 버스에 나갑니다. 확인을 누르면 전송 단계로 넘어갑니다." },
      { label: "전송 확인", note: "한 번만 내보냅니다. 되돌릴 수 없고, 월패드의 반응은 관측으로만 알 수 있습니다." },
      { label: "전송 결과", note: this.state.labResult || "" },
    ];
    return {
      bg1: active(0), bg2: active(1), bg3: active(2),
      dot1: dot(0), dot2: dot(1), dot3: dot(2),
      lenText,
      lenColor: valid ? "var(--primary-text-color)" : "var(--error-color)",
      nextLabel: ["미리보기", "확인", "전송", "다시 입력"][step],
      backLabel: step === 0 ? "지우기" : "뒤로",
      nextBg: step === 2 ? "var(--error-color)" : "var(--primary-color)",
      nextDisabled: !valid && step < 3,
      panelLabel: panels[step].label,
      panelHex: grouped || "—",
      panelNote: panels[step].note,
      next: () => {
        if (step === 3) return this.setState({ labStep: 0, labResult: "" });
        if (!valid) return;
        if (step < 2) return this.setState({ labStep: step + 1 });
        this.setState({
          labStep: 3,
          labResult: `${this.now()}에 ${bytes}바이트를 한 번 보냈습니다. 요청한 상태는 관측하지 못했습니다.`,
        });
        this.write({ key: "lab", label: `임의 전송 ${bytes}바이트`, reqText: "응답", confirms: false });
      },
      back: () => (step === 0 ? this.setState({ hex: "" }) : this.setState({ labStep: step - 1 })),
    };
  }

  renderVals() {
    const locked = this.state.send === "sending" || this.state.send === "off" || this.state.send === "quiet";
    const showGuess = this.props.showGuessCandidates ?? true;
    return {
      send: this.state.send,
      progress: this.state.progress,
      detail: this.state.detail,
      remaining: this.state.remaining,
      locked,
      showGuess,
      hideGuess: !showGuess,
      lights: this.lightRows(locked),
      zonesConfirmed: this.zoneRows("confirmed", locked),
      zonesGuess: this.zoneRows("guess", locked),
      statePreviews: STATE_PREVIEWS.map((p) => ({
        label: p.label,
        class: this.state.send === p.id ? "ha-chip ha-chip--active" : "ha-chip",
        pick: () => {
          clearInterval(this._timer);
          this.setState({ send: p.id, progress: 0, pendingKey: null, detail: "", remaining: "" });
        },
      })),
      bannerPrimary: () => {
        const s = this.state.send;
        if (s === "off" || s === "quiet") this.setState({ send: "ready" });
        else if (s === "unconfirmed") this.setState({ send: "ready", pendingKey: null });
        else if (s === "doorbell")
          this.write({ key: "lobby", label: "공동 현관 열기", reqText: "열림", confirms: false });
      },
      bannerSecondary: () => this.setState({ send: "ready", pendingKey: null }),
      callUp: () => this.write({ key: "elev-up", label: "승강기 상행 호출", reqText: "상행", confirms: false }),
      callDown: () => this.write({ key: "elev-down", label: "승강기 하행 호출", reqText: "하행", confirms: false }),
      openHome: () => this.write({ key: "door-home", label: "세대 현관 열기", reqText: "열림", confirms: false }),
      openLobby: () => this.write({ key: "door-lobby", label: "공동 현관 열기", reqText: "열림", confirms: false }),
      closeGas: () => this.write({ key: "gas", label: "가스 밸브 닫기", reqText: "닫힘", confirms: false }),
      frames: FRAMES.map((f) => ({
        series: f.series,
        hex: f.hex,
        decoded: f.decoded,
        elapsed: f.elapsed,
        seriesColor: f.known ? "var(--primary-text-color)" : "var(--secondary-text-color)",
        decodedColor: f.known ? "var(--primary-text-color)" : "var(--secondary-text-color)",
      })),
      captureStatus: this.state.capturing
        ? "수집 중 · 프레임을 받는 대로 기록합니다"
        : "지금은 수집하지 않습니다 · 마지막 수집 13:04:52에 마무리",
      startCapture: () => this.setState({ capturing: true }),
      stopCapture: () => this.setState({ capturing: false }),
      hex: this.state.hex,
      setHex: (ev) => this.setState({ hex: ev.target.value, labStep: 0, labResult: "" }),
      lab: this.labVals(),
    };
  }
}

