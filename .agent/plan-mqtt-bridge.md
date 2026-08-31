# M6 리서치 · MQTT 자동 발견 다리

작성 시각: 2026-08-31 · 애드온 0.4.2 기준 · 대상 릴리스 0.5.0

이 문서는 워크플로 11개 에이전트(리서치 6축 · 설계 1 · 적대적 검토 3 · 종합 1,
1,771,661 토큰)가 산출한 최종 명세입니다. `AGENTS.md`는 서브에이전트 위임을
금지하지만 "사용자가 달리 지시할 때까지"라는 단서가 있고, `ultracode` 지시가
그에 해당합니다. 아래 주장들은 Home Assistant 소스와 이 저장소의 실측 자료에
대조되었으나, **살아 있는 브로커에서 실행된 적은 없습니다.**

---

Every contested claim is now settled against source or fixtures. Writing the final specification.

---

> **읽는 순서.** 아래 본문은 리서치가 낸 명세이고, 그 뒤의 **「사용자 결정 · 확정」** 절이
> 본문을 덮어씁니다. 본문만 보고 구현하면 결정이 빠집니다. 실제로 두 번 그렇게 되었습니다:
> 승강기 버튼이 비활성으로(0.5.1에서 수정), 꺼진 존의 목표 차단이 통째로 누락된 채로
> (0.5.2에서 수정) 배포되었습니다. 둘 다 결정 절에는 정확히 적혀 있었습니다.

# MQTT bridge for `bestium-eco-foret` — final specification

**Target version 0.5.0. Minimum Home Assistant 2024.11** (device-based discovery; `valve` needs 2024.1, `event` needs 2023.8 — both below the floor).

---

## 0. What changed from the draft, and why

Four things in the draft were wrong at the source. Two blocked.

| # | Draft claimed | Source says | Result |
|---|---|---|---|
| 1 | Rule 0 holds because reads come from `getDevices()` | `protocol-debug.ts` writes **direct replies** into that tree — lights `:145`/`:162`, heating `addressed` 1–4 `:205`, gas (payload 7 falls through the same branch) | **§1 — new `polled` field. `protocol-debug.ts` is no longer "unchanged."** |
| 2 | Elevator floor templates `value_json.elevator.floor` | `mark("elevator", {floor: payload[7], floorLabel: floorLabel(...)})` — `floor` is the **raw byte**. Fixture `f70d013401411000a5b10b80ee` → `floor: 177` | **Tree's `floor` is built from `floorLabel`.** Regression of the bug named at `protocol-debug.ts:68`. |
| 3 | "Elevator staleness is true almost always" | Fixture `f70d0134014110000000009fee` → payload 9 ≥ 8, decodes, `mark()`s fresh. The 4,687 idle observations are **responses**, arriving every 1.2–2.0 s | **Premise inverted. Elevator gets a per-device availability topic** (§2.2). |
| 4 | Door: `count > seen` with `seen` from the first tick | `createDevices()` builds `entrances.household` from `initialFreshness()` alone — **no `doorOpenCount`**. `1 > undefined` is `false` | **`?? 0` on both sides.** Every add-on restart ate one door event. |

**Where the critiques are wrong — one line each:**

- *Measurement/Operations' fix for #1 (`pollAtMs` alone, bridge samples on it)* — insufficient: a poll stamps `pollAtMs = T2`, a command's reply overwrites `state` at T2+118 ms, and the tick at T2+500 ms sees an **advanced timestamp over a contaminated value**. The values must be copied, not just timestamped. §1.
- *Measurement's Defect 3 remedy ("keep LWT-only, fix the stated reason")* — the finding lands but the remedy is superseded: once the elevator is known fresh whenever the bus is up, a per-device availability topic is both available and strictly better than the LWT.
- *Operations' new `BASE/avail/link` topic* — unnecessary for the same reason; elevator staleness **is** the RS-485-down signal, at no new topic.
- *Operations' `qos`-at-root risk* — verified valid: `DEVICE_DISCOVERY_SCHEMA` carries `vol.Optional(CONF_QOS): valid_qos_schema`. No change.
- *Operations' component-removal risk* — settled by the docs: *"An empty config can be published as an update to remove a single component… adding the `platform` (`p`) option is still required."* Adopted as the not-live form (§3.3); omission is not relied on.
- *Operations' `getLink()` third edit* — deleted instead. With generation-checked `polled` staleness, `linkUp` is redundant; a relink bumps the generation and every device goes stale at once. Two `m2.ts` edits, and the `getTxState()`-calls-`snapshot()` cost disappears with it.
- *Safety's blanket `enabled_by_default: false` including gas* — over-broad. `valve` is outside `DEFAULT_EXPOSED_DOMAINS`, ships no `reproduce_state.py`, and registers no `turn_off`; the readout is the safety-useful half. Disabled by default: `batch_off` and the two elevator buttons only.
- *Measurement's "rename the door event type"* — the uncertainty is about the **cause**, not the observation; the door did open. It goes in the entity name and DOCS, not in `event_types`.
- *Operations' PINGREQ note* — correct (3.1.1 §3.12: client→server only), and aimed at the task brief, not the design. No design change; the watchdog is on **PINGRESP**.

---

## 1. The one rule, and the decoder change that makes it true

**An entity's state is written only from a decoded poll frame.** Three measurements force it: gas answers byte-identically whether or not the valve moved (`spec-device-protocol.md:191`); a heating zone echoed a 4 °C target it did not adopt (`:90`); the heating group draws no direct reply at all (`:114`).

The draft asserted this and then read a tree that violates it. Provenance map, verified frame by frame:

| Device | Poll discriminator | Direct reply decoded into the tree? |
|---|---|---|
| lights `0x19` | `payload[2]===0x04 && payload[4]===0x10` | **yes** — two branches (`0x04` addr `0x11`–`0x13`; and `payload[2]===0x02`) |
| heating `0x18` | `payload[2]===0x04 && (payload[4]&0x0f)===0` | **yes** — `addressed` 1–4 |
| gas `0x1B` | `payload.length >= 9` (poll `f70d…` → payload 9; reply `f70b011b0443110303b0ee` → payload 7) | **yes** — same branch, `payload[6]` |
| batch-off `0x2A` | `payload.length >= 10` | no — reply payload is 8, the guard drops it |
| elevator `0x34` | every frame is `kind=01` | **no** — M4-E150: `matchingFrameAgoMs` is `None` on all four call sends; registration read from the status stream at 1,582/1,588/1,838 ms. The `protocol-debug.ts:640` comment is loose wording for *the status stream carries the building's standing call*. |
| entrance `0x1E` | notification only | n/a — 11 sends opened nothing |

### The change — five lines in `protocol-debug.ts`

Each **poll** branch additionally writes a `polled` object holding exactly the fields the bridge publishes, stamped with the existing helper:

```ts
// lights, inside the payload[4] === 0x10 loop
lights[index + 1] = { ...lights[index + 1], state, ...freshness(at, generation),
  polled: { state, ...freshness(at, generation) } };

// heating, inside the addressed === 0 loop
heating[zone] = { ...heating[zone], state, currentC, targetC, ...freshness(at, generation),
  polled: { state, currentC, targetC, ...freshness(at, generation) } };

// gas — the poll is the 9-byte payload; the 7-byte direct reply keeps writing `state` for isConfirmed()
if (payload.length >= 9) mark("gas", { state, evidence: "observed", polled: { state, ...freshness(at, generation) } });
else                     mark("gas", { state, evidence: "observed" });

// elevator and batch-off have no decoded reply; they get `polled` for uniformity, not for safety
mark("elevator", { floor: payload[7], floorLabel: floorLabel(payload[7]), heading, call, evidence: "observed",
  polled: { floorLabel: floorLabel(payload[7]), heading, call, ...freshness(at, generation) } });
mark("batchOff", { state, evidence: "observed", polled: { state, ...freshness(at, generation) } });
```

**Why `polled` and not a timestamp.** A timestamp says *when the last poll was*; it does not un-write what a reply put over the value. Copying the values at poll time is race-free by construction, and the reply branches are untouched, so `isConfirmed()`, `tx-queue.ts` and the page keep their ~100 ms confirmation exactly as measured.

`polled` survives the reply branches' `{...existing, ...value}` spreads and survives `resetGeneration()` (which does not recreate `devices`) — which is why `polled` carries its own `generation`, and the bridge checks it.

**The gas case, worked, because it is the one that matters.** Run `gas-b`, `spec-device-protocol.md:183`:

```
    0 ms   MQTT CLOSE → tx.send
 +118 ms   reply f70b011b0443110303b0ee → devices.gas.state = "closed"   ← polled untouched
+1000 ms   tick: polled.state still "open" → nothing published
+1518 ms   poll 03 → polled.state = "closed"
+2000 ms   tick: publish gas: closed                                      ← poll-sourced
```
And when the close does **not** take, the reply is byte-identical, `polled` never moves, and HA is never told `closed` about a valve a person must walk to.

**Cost, stated:** `protocol-debug.ts` and `test/protocol-debug.test.ts` are now in scope. MQTT state lags the page by up to one poll (≤2.3 s) on every command. That lag is the confirmation discipline, not a defect.

### The other three constraints

1. `optimistic` is never `true`. Every stateful entity has a state topic; set it explicitly on `valve`, omit elsewhere.
2. The command handler publishes **nothing** to a state topic. It calls `tx.send` and returns.
3. The bridge never issues a query frame — that would be a transmitter outside the silent-query gate, the gate whose 194 sends damaged 0 bytes against 183 ungated sends that damaged 959.
4. `retain: false` on every component with a command topic, **and** the bridge drops any inbound PUBLISH with the retain bit set (§6.3).

---

## 2. The three hard cases

### 2.1 Gas — a control you can only move one way

**Decision: MQTT `valve`, `device_class: "gas"`, `payload_open: null`, `payload_close: "CLOSE"`.**

**Reasoning.** Verified in `mqtt/valve.py`:

```python
supported_features = ValveEntityFeature(0)
if CONF_COMMAND_TOPIC in config:
    if config[CONF_PAYLOAD_OPEN] is not None:
        supported_features |= ValveEntityFeature.OPEN
    if config[CONF_PAYLOAD_CLOSE] is not None:
        supported_features |= ValveEntityFeature.CLOSE
```

with `vol.Optional(CONF_PAYLOAD_OPEN): vol.Any(cv.string, None)` — JSON `null` validates. `valve/__init__.py` registers `open_valve` behind `[ValveEntityFeature.OPEN]`, so it is never registered on this entity; `toggle` requires `OPEN|CLOSE` as an equality check and fails too. **The unsafe direction does not exist on the entity**, rather than being hidden by UI convention.

Three details decide whether it works:

- The `null` must be **present and literally `null`**. `_validate_and_add_defaults` returns `{**DEFAULTS, **config}` with `DEFAULT_PAYLOAD_OPEN = "OPEN"`, so omitting the key grants OPEN. `""` passes `cv.string` and `"" is not None` is True, so it grants OPEN *and* publishes an empty payload. Test 7 asserts `hasOwnProperty` + `=== null`.
- `reports_position: false` is required for `payload_close`/`state_open`/`state_closed` to be consulted.
- Omit `payload_stop`, and never publish `state_opening`/`state_closing` — this bus reports no transitional state and `is_closing` would have nothing to clear it.

Reopening needs no design: a person opens the valve by hand, the next `0x1B` poll publishes `open`, the entity flips. HA never sent a command. Both directions of the transition are measured.

**Rejected.** `switch` — one command topic, both payloads plain strings, no per-direction opt-out; `turn_on` publishes, returns SUCCESS, and snaps back on the next poll. That is exactly what the legacy shipped: a gas `switch` with a full `payload_on`, while its own packet builder carries `04 = ON (지원되지 않음)` and its command queue silently substitutes a status query for the set-True branch. `lock` — schema requires both payloads. `cover` — unverified whether it drops OPEN on `payload_open: null`; do not assume it transfers.

**Cost — three vectors that stay open, and one that the draft aimed at the wrong way:**

- **The one the draft missed.** `intent/__init__.py` `OnOffIntentHandler` maps, for VALVE, `HassTurnOn → open_valve` (harmless, `ServiceNotSupported`) **and `HassTurnOff → close_valve`, which is supported and irreversible.** *"Turn off everything in ⟨area⟩"* — area-scoped, the valve's name never spoken — closes it. Conditional, not default: `valve` is outside `DEFAULT_EXPOSED_DOMAINS` (verified: `climate, cover, fan, humidifier, light, media_player, scene, switch, todo, vacuum, water_heater`). It arms the moment someone bulk-exposes the device in Settings → Voice assistants.
- Google's `OpenCloseTrait` sets `queryOnlyOpenClose` only when *both* directions are absent, so a CLOSE-only valve is advertised as openable and an open attempt surfaces as `ERR_UNKNOWN_ERROR`. Alexa advertises `state.closed` only while `semantics()` still maps the open utterance to `state.open`.
- `OpenCloseTrait.query_attributes` raises for a valve in state `unknown`. The connect sequence publishes the state tree before the discovery config, so the window is one poll cycle.

The entity stays `enabled_by_default: true`: the readout is the safety-useful half, and every default-on reach path is already closed.

### 2.2 Elevator — readable only while a call is standing

**Decision: three sensors (floor / heading / call) + two `button`s. Per-device availability `BASE/avail/elevator`. The string `"None"` for a value the frame does not carry; `"none"` for a frame that says "standing".**

**Reasoning — the draft's premise was backwards.** The fixture `f70d0134014110000000009fee` has payload length 9, clears the handler's `>= 8`, decodes to `heading: "none", call: "none", floorLabel: null`, and `mark()`s the device fresh. Idle frames arrive every 1.2–2.0 s and the return to idle is measured (`06:41:28 → 01 도착 층 4`, `06:41:30 → 00 대기 층 0`). **The elevator device is fresh whenever the bus is up.** That inverts three conclusions:

- Per-device availability is now correct and better than the LWT: it does **not** trip during normal idle, and it *does* trip when the EW11 dies — which fixes the draft's real hole, two call buttons that stayed `available` and silently did nothing with the bus down for an hour.
- The 6 s window (`DEVICE_POLL_MS.elevator × 3`) stands, but its stated reason ("otherwise the last floor lingers for half a minute") was invented — the bus overwrites the floor with `00` within ~2 s on its own. The real reason is that 6 s is three missed polls of a device that answers every 2 s.
- Absence of `0x34` frames is a **fault**, not normal. The draft said the opposite.

**Idle vs. absent, preserved exactly.** Floor byte `00` → `floorLabel()` returns `null` → the tree publishes `"None"` → `unknown`. Heading and call publish `"none"` — a real value meaning *a frame exists and the car is standing*. So `승강기 층` reads `unknown` while idle because the position genuinely is not knowable, while the other two read a measured state. The two facts stay distinguishable, which is what the draft claimed and its own test #10 destroyed.

**Why the literal string `"None"`.** `mqtt/const.py`: `PAYLOAD_NONE = "None"`. In `mqtt/sensor.py._update_state` the order is: expiry → template → **`if payload == PAYLOAD_NONE: native_value = None; return`** → numeric → options/enum. So `"None"` reaches `unknown` on a plain-string sensor and an `enum` sensor alike, without adding `None` to `options`. Publish the **string** inside the JSON tree, never JSON `null`.

**Rejected, with the reason each is a lie:** `unavailable` via `expire_after` — HA's quality-scale rule draws the line on cause, and between calls the add-on is up, the link is up and the device is answering; `unavailable` reads as "integration broken" and is excluded from history. Last-known — `00 00 00` in 4,687 of 4,687 idle observations means the position is not knowable; this is precisely the legacy's failure, which published `{"direction": "", "floor": ""}` on idle, storing a blank string as a real value. A sentinel `"idle"` in `options` — conflates "standing" with "no frame."

**Three sensors, not one.** M4-E149: collapsing the nibbles hid `0xA5` ("heading up, an up call waiting") as a plain "up" — the only signal that can say whether a call frame of ours registered. `decodeState` already keeps them separate.

**Calls are `button`s.** No state topic, which is the right shape for a control with no cancel and no readable armed state — the building offers none (operator-confirmed; our three revoke sends drew nothing, and M4-E150 records that the revoke was never in a testable window anyway). Rejected: `switch` (what the legacy shipped, with a `payload_off` for a cancel that does not exist, desyncing the moment a neighbour's up-call puts `{state: 5}` on the line); `select`; `scene`.

**Costs, all measured:**

- Registration lag is **1,560–1,838 ms**, and the status stream carries the *building's* standing call, not ours. So after a press the three sensors keep publishing the pre-call state for ~1.6 s. That is what the bus says, not a lie — but it is why `isConfirmed()` requires a *change* for this one control, and why a `button` gives HA no failure feedback. The `elevator_call` sensor is the only signal. DOCS.
- Retry amplification: because confirmation is structurally impossible when a neighbour's call already stands in the same direction, `runIntent` puts **three call frames** on the bus for one press (`maxAttempts = tx_max_attempts` for `observed` evidence). The bridge must not add a retry, and `unconfirmed` on the elevator must never be wrapped in an automation `repeat`. DOCS.
- The floor field **skips floors** — `1 → 1 → 3 → 4`, floor 2 never sampled, because frames arrive every 1.3–2.0 s and the car is faster. It is a label with gaps, not a position track. No `state_class` (which would push `B1` into long-term statistics and fail), no `device_class`, no unit — so it cannot be graphed. Correct trade for a label that is not a number.
- At add-on start `initialFreshness()` gives `{lastSeenAtMs: 0, generation: 0}` against a generation `openLink()` has already bumped to 1 → stale → the first publish is all-`"None"` with `avail/elevator` `offline`, filled in ~2 s later.

### 2.3 Entrance door — an event with no closing counterpart

**Decision: the `event` platform. There is no interval, because there is nothing to return from.**

**Reasoning.** An `event` entity's state *is* the timestamp of the last event, with `event_type` as an attribute. There is no on-state to clear, therefore no "closed" state to fabricate and no interval to invent. The bus has no door-CLOSED notification of any kind and the status query is byte-identical 4,865 times out of 4,865. `event` is the only platform whose state model matches that.

Three properties come free:
- **Retained payloads are discarded** — `mqtt/event.py._event_received` opens with `if msg.retain: … return`. Landed in 2024.1; on 2023.x a retained payload would have fired. The discard logs at DEBUG only, so publish with `retain: false` anyway and let the discard be the belt.
- **Restart is honest** — `EventEntity` extends `RestoreEntity`, so after an HA restart it still reads "last opened at 19:41:07". Before the first-ever event it is `unknown`, which is correct: the add-on cannot know whether the door opened while HA was down.
- `""`, `"None"` and `"{}"` are all no-ops.

**Burst handling.** One press puts three frames on the line 0.69 s apart. `decodeState` already coalesces them (`DOOR_EVENT_WINDOW_MS = 3_000`; `doorOpenAtMs` is kept rather than restarted inside the window while `doorOpenCount` increments exactly once). The bridge watches `doorOpenCount`. Publishing per frame would render three door openings.

**Watch the counter, never the flag** — `doorOpenObserved` is cleared by `snapshot()`'s staleness pass (`:521`) and is never set `true` by `decodeState`, so diffing it yields a spurious falling edge ~30 s after every press.

**Seeding, corrected (draft defect 4).** `createDevices()` builds `entrances.household` from `initialFreshness()` alone — there is no `doorOpenCount` until the first door frame creates it. `1 > undefined` is `false`, so the draft's guard **ate the first door event after every add-on restart**. The fix is `?? 0` on both sides:

```ts
const count = (entry.doorOpenCount as number | undefined) ?? 0;
if (seeded && count > seen) publishDoorEvent();
seen = count;
```

**`device_class` omitted.** `EventDeviceClass` is exactly `DOORBELL`, `BUTTON`, `MOTION` — no door class. `doorbell` is wrong twice: bell, intercom and video are entirely off this line (confirmed three times), and `async_internal_added_to_hass` logs a deprecation unless a doorbell's `event_types` contains `ring` ("will stop working in Home Assistant 2027.4").

**Rejected: `binary_sensor` + `off_delay`.** It works, and the floor would be ≥ 2 s (the burst spans 1.38 s and the timer re-arms per frame). But it invents a closed state the bus never reports: history shows every opening as a fabricated N-second `on` interval, and any automation on `to: "off"` fires on a timer rather than on a door. Above the 2 s floor there is nothing measured to derive from — **1.38 s is the length of the notification, not of the door being open.** Choosing `event` deletes the question rather than answering it with a guess.

**Cost, and it is the one an operator will trip over.** `measured-capabilities.md` §1.6: *"월패드가 문을 열면 이 세 프레임이 흐릅니다"* — the frames flow when **the wallpad** opens the door, and `protocol-debug.ts:250` leaves undecided whether the frame is the command or the notice that a call ended because the door opened. Nothing measured says a keypad or key entry from outside puts anything on this line; §4 lists 출입구 전체 as unmeasured pending the subphone (`0x7F`, 0 of 44,986 frames). So this is **not** a general door sensor. The entity is named 세대현관 문열림 (월패드 조작) and DOCS says so, because otherwise someone builds a "someone came home" automation on a signal that only fires when a person inside pressed the button. `event_types: ["opened"]` stays — the door did open; the uncertainty is about the cause, and that belongs in the name, not the type.

---

## 3. The discovery payload

### 3.1 Form: device-based, one topic, minimal root

`PUBLISH homeassistant/device/bestium-eco-foret/config`, **retain true**, QoS 0.

The root is validated with `PREVENT_EXTRA` (`DEVICE_DISCOVERY_SCHEMA` extends `_MQTT_AVAILABILITY_SCHEMA`, a plain `vol.Schema`; `.extend()` preserves the mode). **One unrecognised root key rejects the entire device — all sixteen entities — with only a `_LOGGER.warning` and `return MQTTDiscoveryPayload({})`.** An invalid payload is a no-op, not a removal, so existing entities survive; but "no entities appeared" and "nothing was published" look identical from outside. Check the HA log.

Root keys are exactly four: `device`, `origin`, `qos`, `components`. `qos` is **verified valid** at root (`vol.Optional(CONF_QOS): valid_qos_schema`) and is in `SHARED_OPTIONS`, so it inherits into every component — which is what we want.

Not at root, and each for a verified reason:
- **`availability_topic`** — `_merge_common_device_options` copies a shared option in **only when absent from the component**: `if option in device_config and option not in component_config`. Both `availability` and `availability_topic` are in `SHARED_OPTIONS` and are `vol.Exclusive` on the same marker. A root `availability_topic` would land beside a component's own `availability` and reject the device. Every component carries its own explicit `availability` list.
- **`state_topic`** — it would inherit into the two `button`s, which have no use for one. Eight explicit lines cost nothing against a whole-device rejection.
- **`configuration_url`** — must be `homeassistant://navigate/…` to pass `cv.configuration_url` and `vol.Url()`; not worth a validation risk that rejects sixteen entities.

Use **full key names, never abbreviations**: `_replace_all_abbreviations` runs *before* validation, so a mistyped abbreviation is never expanded and then trips `PREVENT_EXTRA` — same total rejection, for a typo. ~8 KB; the bytes are not worth it.

Per-component discovery with a shared `device` block is the version-independent alternative and would drop the floor to 2024.1. Rejected: sixteen publishes and sixteen removal paths instead of one, and 2024.11 is nearly two years old today. The add-on has never published MQTT, so no `migrate_discovery` handshake is ever needed.

### 3.2 Entity table — complete and literal

One HA device, `identifiers: ["bestium_eco_foret"]`, name `BESTIUM 월패드`. **Sixteen components always present**; two are removal-shaped when commands are off.

`BASE` = `bestium-eco-foret`. Every template reads `BASE/state`.

| Device (bus) | key | Platform | State template | Command topic | Availability | Default |
|---|---|---|---|---|---|---|
| lights `0x19` lamp 1 | `light_1` | `light` | `state_value_template: {{ value_json.lights['1'] }}` | `BASE/cmd/light/1` ← `ON`\|`OFF` | LWT + `avail/lights`, `all` | on |
| lamp 2 | `light_2` | `light` | `…lights['2']` | `BASE/cmd/light/2` | ″ | on |
| lamp 3 | `light_3` | `light` | `…lights['3']` | `BASE/cmd/light/3` | ″ | on |
| heating `0x18` zone 1 | `heat_1` | `climate` | `heating['1'].mode` / `.current` / `.target` | `BASE/cmd/heating/1/mode` ← `heat`\|`off`; `BASE/cmd/heating/1/temperature` ← int | LWT + `avail/heating`, `all` | on |
| zones 2–4 | `heat_2`,`heat_3`,`heat_4` | `climate` | ″ (index 2/3/4) | ″ | ″ | on |
| gas `0x1B` | `gas` | `valve` | `value_template: {{ value_json.gas }}` | `BASE/cmd/gas` ← `CLOSE` only | LWT + `avail/gas`, `all` | on |
| batch-off `0x2A` | `batch_off` | `switch` | `{{ value_json.batch_off }}` | `BASE/cmd/batch_off` ← `ON`\|`OFF` | LWT + `avail/batchoff`, `all` | **off** |
| elevator floor | `elevator_floor` | `sensor` (string) | `{{ value_json.elevator.floor }}` | — | LWT + `avail/elevator`, `all` | on |
| elevator heading | `elevator_heading` | `sensor` `enum` | `…elevator.heading` | — | ″ | on |
| elevator call | `elevator_call` | `sensor` `enum` | `…elevator.call` | — | ″ | on |
| elevator up-call | `elevator_call_up` | `button` | none | `BASE/cmd/elevator` ← `UP` | ″ | **off** |
| elevator down-call | `elevator_call_down` | `button` | none | `BASE/cmd/elevator` ← `DOWN` | ″ | **off** |
| entrance `0x1E` | `entrance_door` | `event` | own topic `BASE/event/entrance` | — | **LWT only** | on |

The door event is LWT-only deliberately: its state is a timestamp of a *past* event, which stays true whether or not the bus is up. Marking a historical timestamp `unavailable` asserts nothing an operator acts on. (`entrances.household` is also only marked fresh by the notification frames, so it carries no staleness signal anyway.)

**Topic map**

| Topic | Retain | Payload |
|---|---|---|
| `BASE/status` | **true** | `online`/`offline`. Also the CONNECT Will (`offline`, retain true) |
| `BASE/avail/{lights,heating,gas,batchoff,elevator}` | **true** | `online`/`offline` |
| `BASE/state` | **true** | the JSON tree (§4) |
| `BASE/event/entrance` | **false** | `{"event_type":"opened"}` |
| `homeassistant/device/bestium-eco-foret/config` | **true** | the discovery payload |
| `BASE/cmd/#` | never published by us | subscribed at QoS 1 |
| `homeassistant/status` | — | subscribed at QoS 0 |

**Frozen identifiers.** The topic `object_id` `bestium-eco-foret`, the device `identifiers` value `bestium_eco_foret`, every `components` key and every `unique_id` are load-bearing: HA builds `discovery_hash = (platform, "bestium-eco-foret <key>")` from them. Renaming one orphans the entity and leaves a ghost that nothing removes. Note the standing invitation to "tidy" the hyphen/underscore inconsistency between the topic and `identifiers` — whoever does orphans sixteen entities. A comment is not enough; test 6b snapshots them as literal strings.

**Literal payload, commands live** (`heat_2..4`, `light_2..3`, `elevator_call_down` elided only where mechanical):

```json
{
  "device": {
    "identifiers": ["bestium_eco_foret"],
    "name": "BESTIUM 월패드",
    "manufacturer": "Bestium",
    "model": "Eco-Foret Wallpad",
    "sw_version": "0.5.0"
  },
  "origin": { "name": "bestium-eco-foret", "sw_version": "0.5.0" },
  "qos": 1,
  "components": {
    "light_1": {
      "platform": "light",
      "unique_id": "bestium_eco_foret_light_1",
      "name": "등 1",
      "state_topic": "bestium-eco-foret/state",
      "state_value_template": "{{ value_json.lights['1'] }}",
      "payload_on": "ON",
      "payload_off": "OFF",
      "command_topic": "bestium-eco-foret/cmd/light/1",
      "retain": false,
      "availability": [
        { "topic": "bestium-eco-foret/status" },
        { "topic": "bestium-eco-foret/avail/lights" }
      ],
      "availability_mode": "all"
    },

    "heat_1": {
      "platform": "climate",
      "unique_id": "bestium_eco_foret_heat_1",
      "name": "난방 1",
      "modes": ["off", "heat"],
      "mode_state_topic": "bestium-eco-foret/state",
      "mode_state_template": "{{ value_json.heating['1'].mode }}",
      "mode_command_topic": "bestium-eco-foret/cmd/heating/1/mode",
      "current_temperature_topic": "bestium-eco-foret/state",
      "current_temperature_template": "{{ value_json.heating['1'].current }}",
      "temperature_state_topic": "bestium-eco-foret/state",
      "temperature_state_template": "{{ value_json.heating['1'].target }}",
      "temperature_command_topic": "bestium-eco-foret/cmd/heating/1/temperature",
      "temperature_command_template": "{{ value | int }}",
      "temperature_unit": "C",
      "min_temp": 5,
      "max_temp": 40,
      "temp_step": 1,
      "precision": 1.0,
      "retain": false,
      "availability": [
        { "topic": "bestium-eco-foret/status" },
        { "topic": "bestium-eco-foret/avail/heating" }
      ],
      "availability_mode": "all"
    },

    "gas": {
      "platform": "valve",
      "unique_id": "bestium_eco_foret_gas",
      "name": "가스 밸브",
      "device_class": "gas",
      "state_topic": "bestium-eco-foret/state",
      "value_template": "{{ value_json.gas }}",
      "state_open": "open",
      "state_closed": "closed",
      "command_topic": "bestium-eco-foret/cmd/gas",
      "payload_open": null,
      "payload_close": "CLOSE",
      "reports_position": false,
      "optimistic": false,
      "retain": false,
      "availability": [
        { "topic": "bestium-eco-foret/status" },
        { "topic": "bestium-eco-foret/avail/gas" }
      ],
      "availability_mode": "all"
    },

    "batch_off": {
      "platform": "switch",
      "unique_id": "bestium_eco_foret_batch_off",
      "name": "일괄소등 (집 전체 소등)",
      "icon": "mdi:home-lightbulb-off",
      "enabled_by_default": false,
      "state_topic": "bestium-eco-foret/state",
      "value_template": "{{ value_json.batch_off }}",
      "state_on": "ON",
      "state_off": "OFF",
      "command_topic": "bestium-eco-foret/cmd/batch_off",
      "payload_on": "ON",
      "payload_off": "OFF",
      "retain": false,
      "availability": [
        { "topic": "bestium-eco-foret/status" },
        { "topic": "bestium-eco-foret/avail/batchoff" }
      ],
      "availability_mode": "all"
    },

    "elevator_floor": {
      "platform": "sensor",
      "unique_id": "bestium_eco_foret_elevator_floor",
      "name": "승강기 층",
      "icon": "mdi:elevator",
      "state_topic": "bestium-eco-foret/state",
      "value_template": "{{ value_json.elevator.floor }}",
      "availability": [
        { "topic": "bestium-eco-foret/status" },
        { "topic": "bestium-eco-foret/avail/elevator" }
      ],
      "availability_mode": "all"
    },
    "elevator_heading": {
      "platform": "sensor",
      "unique_id": "bestium_eco_foret_elevator_heading",
      "name": "승강기 진행 방향",
      "device_class": "enum",
      "options": ["none", "up", "down"],
      "state_topic": "bestium-eco-foret/state",
      "value_template": "{{ value_json.elevator.heading }}",
      "availability": [
        { "topic": "bestium-eco-foret/status" },
        { "topic": "bestium-eco-foret/avail/elevator" }
      ],
      "availability_mode": "all"
    },
    "elevator_call": {
      "platform": "sensor",
      "unique_id": "bestium_eco_foret_elevator_call",
      "name": "승강기 호출 상태",
      "device_class": "enum",
      "options": ["none", "arrival", "up", "down"],
      "state_topic": "bestium-eco-foret/state",
      "value_template": "{{ value_json.elevator.call }}",
      "availability": [
        { "topic": "bestium-eco-foret/status" },
        { "topic": "bestium-eco-foret/avail/elevator" }
      ],
      "availability_mode": "all"
    },

    "elevator_call_up": {
      "platform": "button",
      "unique_id": "bestium_eco_foret_elevator_call_up",
      "name": "승강기 상행 호출",
      "icon": "mdi:elevator-up",
      "enabled_by_default": false,
      "command_topic": "bestium-eco-foret/cmd/elevator",
      "payload_press": "UP",
      "retain": false,
      "availability": [
        { "topic": "bestium-eco-foret/status" },
        { "topic": "bestium-eco-foret/avail/elevator" }
      ],
      "availability_mode": "all"
    },

    "entrance_door": {
      "platform": "event",
      "unique_id": "bestium_eco_foret_entrance_door",
      "name": "세대현관 문열림 (월패드 조작)",
      "icon": "mdi:door-open",
      "state_topic": "bestium-eco-foret/event/entrance",
      "event_types": ["opened"],
      "availability": [{ "topic": "bestium-eco-foret/status" }]
    }
  }
}
```

**`enabled_by_default: false` on `batch_off` and the two buttons — reasoning and its exact limit.**

Verified: `vol.Optional(CONF_ENABLED_BY_DEFAULT, default=True): cv.boolean` in `MQTT_ENTITY_COMMON_SCHEMA`. Verified: `switch` **is** in `DEFAULT_EXPOSED_DOMAINS`, `switch/reproduce_state.py` exists and calls `turn_on`/`turn_off`, and plain `switch` falls through `OnOffIntentHandler` to `switch.turn_on`. So with zero operator action, *"turn on everything in ⟨area⟩"*, `homeassistant.turn_on` with `entity_id: all`, and a scene restore all reach `cmd/batch_off` with `ON` — and **`ON` darkens the whole home**, including rooms the wallpad cannot otherwise address. Every "turn everything on" reflex in HA does the opposite of what the operator means. For the buttons the default-on path is the auto-generated Overview, which renders two bare PRESS tiles with no confirmation, adjacent to the light toggles; `confirmation:` is dashboard-only and MQTT discovery cannot express it.

**Its limit, stated so nobody reads it as more than it is:** `enabled_by_default` affects **registry-entry creation only**. It does not retroactively disable an entity on an install that already has these entities, and once the operator enables one it stays enabled across every republish. It is a gate on first appearance, not a lock.

`mqtt_commands_enabled` says *"HA may operate the wallpad."* It does not say *"a voice assistant may darken the house by accident."* Different questions, so different gates. The cost is one enable click per entity, in the device page, at the moment the operator actually wants the control.

### 3.3 Commands not live

Built from the same table with a `commandsLive` flag. When false:

- every `command_topic` / `mode_command_topic` / `temperature_command_topic` / `temperature_command_template` / `payload_press` / `payload_open` / `payload_close` / `retain` key is omitted;
- `elevator_call_up` and `elevator_call_down` become **`{"platform": "button"}` and nothing else** — the doc-prescribed removal form (*"An empty config can be published as an update to remove a single component… adding the `platform` (`p`) option is still required."*). This is the zero-risk form: on a fresh install it is a no-op, on a live→not-live transition it removes the buttons cleanly. The draft omitted the keys entirely, which the source suggests also removes them, but the doc-prescribed form costs the same and is not a guess;
- everything else is byte-identical.

The gas valve then has no `command_topic`, so `supported_features == 0` and it renders as a read-only gas-valve state display. That is a legitimate mode, **not the resolution of hard case 1** — `payload_open: null` is. Verified: `vol.Optional(CONF_COMMAND_TOPIC): valid_publish_topic`, and no validator rejects a valve without one.

```ts
const commandsLive = settings.mqtt_commands_enabled === true
  && settings.transmit_enabled === true;
```

Both are required: `tx.send(…, {mode:"live"})` falls through to `sendOnce` (the refusal path) when `getCurrentUserId()` is undefined or `transmit_enabled !== true`, and `parseM2Settings` already forces `transmit_enabled: false` when `transmit_user_id` is absent (`settings.ts`). Publishing a command topic the send path always refuses renders a control that silently does nothing. Both change only via an options save, which restarts the add-on — republish-on-start covers it, no watcher.

### 3.4 Not published — and why

Heating zones 5–8 (`00 ff ff` across 3,005 polls), outlet `0x1F` and ventilation `0x2B` (queried every sweep, answered zero times), communal entrance (`evidence: "not_decoded"`, byte-identical 4,865/4,865), subphone `0x7F` (0 of 44,986 frames), vehicle, CCTV, the `gasAgrees` diagnostic (268/268 agreement; a diagnostic for a fault that has never occurred), and the two group commands. A permanently-unavailable entity is a standing fault report for hardware that does not exist.

---

## 4. The state tree

### 4.1 Shape

`PUBLISH bestium-eco-foret/state`, **retain true**, QoS 0, republished whenever the serialised JSON differs from the last published string.

```json
{
  "lights":   { "1": "ON", "2": "OFF", "3": "None" },
  "heating": {
    "1": { "mode": "heat", "current": 24, "target": 23 },
    "2": { "mode": "off",  "current": 25, "target": 21 },
    "3": { "mode": "None", "current": "None", "target": "None" },
    "4": { "mode": "off",  "current": 24, "target": 21 }
  },
  "gas": "open",
  "batch_off": "OFF",
  "elevator": { "floor": "None", "heading": "none", "call": "none" }
}
```

That last line is a running bus with the car idle — **`floor: "None"` beside `heading: "none"`**, which is the whole point of §2.2 and the exact case the draft's test #10 got backwards.

Every value comes from `entry.polled`, never from the top-level fields:

| JSON path | Source | Mapping |
|---|---|---|
| `lights[n]` | `devices.lights[n].polled.state` | `on`→`ON`, `off`→`OFF` |
| `heating[n].mode` | `.polled.state` | `on`→`heat`, `off`→`off` |
| `heating[n].current` / `.target` | `.polled.currentC` / `.targetC` | bare integer |
| `gas` | `devices.gas.polled.state` | `open`/`closed` verbatim (the `state_open`/`state_closed` defaults) |
| `batch_off` | `devices.batchOff.polled.state` | `on`→`ON`, `off`→`OFF` |
| `elevator.floor` | `devices.elevator.polled.floorLabel` | `null` → `"None"`, else the label verbatim (`"4"`, `"B1"`) |
| `elevator.heading` / `.call` | `.polled.heading` / `.call` | verbatim |

Any missing `polled`, or a stale one, yields the string `"None"` through one `orNone(v)` helper.

**Vocabulary, deliberately small.** `ON`/`OFF` uppercase for light and switch — MQTT `light` has **no** `state_on`/`state_off`; `payload_on` serves as both the command sent and the state compared, so lowercase `on` gives a light that never reports on and reads exactly like a decode bug. `heat`/`off` for climate. Bare integers for temperatures. `open`/`closed` for the valve. Decoder strings verbatim for the elevator. The string `"None"` anywhere a value is not known.

Verified `"None"` handling: `sensor` (`_update_state`, PAYLOAD_NONE checked before numeric and before options); `light` (docs: *"A `None` payload resets to an `unknown` state"*); `climate` (`handle_climate_attribute_received` and `_handle_mode_received` both `if payload == PAYLOAD_NONE: setattr(…, None); return`).

### 4.2 Retention, and the ordering that makes it safe

The payload itself encodes staleness, so a replayed retained tree cannot assert anything the decoder has not currently observed.

- Add-on running, HA restarts → retained config + retained `online` + retained state, at most one poll old. Correct and instant.
- Add-on down → the broker published the retained Will `offline`. Entities unavailable; the retained state is never shown as live.
- Add-on restarts → `initialFreshness()` (`generation: 0`) against the generation `openLink()` bumped to 1 makes every device stale, so the *first* tree is all-`"None"` and every per-device availability is `offline`. Nothing pre-restart survives into a live-looking reading.

The one hole is ordering: after a crash the Will sets the *global* topic `offline`, but the per-device topics and the state tree keep their retained pre-crash values, and a Will can carry only one topic. **So the connect sequence publishes the global `online` last** (§6.2). Get that wrong and there is a window where HA sees available + retained pre-crash state — a frozen `gas: open` presented as current, which is a lie about a safety device.

### 4.3 Staleness

Re-derived from `getDevices()` — unconditional and stable in shape — applied to `.polled`:

```ts
// Same predicate as protocol-debug.ts staleDevice(), read off `polled` rather than the entry.
const stalePolled = (entry, nowMs, generation, windowMs) => {
  const p = entry?.polled;
  return !p
    || p.generation !== generation
    || p.lastSeenAtMs <= 0
    || nowMs - p.lastSeenAtMs > windowMs;
};
```

`windowMs = DEVICE_POLL_MS[device] * 3` — three consecutive missed polls, derived from a measured constant rather than a knob: heating 6,900 ms, lights 6,600, gas 6,300, elevator 6,000, batch-off 5,580. (The key is `batchOff`, not `batchoff`.) The monitor's own 30 s default is thirteen polls.

**No `linkUp`, and no `getLink()` accessor.** The generation check covers the relink path — `relinkAfter()` → `protocol.resetGeneration()` bumps the generation, so every device's stored `polled.generation` mismatches and all go stale at once. It also covers a link that simply stops delivering: polls stop, the 6 s window expires. This deletes the draft's third `m2.ts` edit and with it the `getTxState()`-calls-`snapshot()` problem, since the bridge never calls it. **Cost:** with the EW11 dead, entities stay available for up to 6 s showing the last poll. Same window as everything else here.

Correction to the draft's rationale, worth knowing: `phase` stays `"running"` through a relink, so `getTxState().link` never reads `"down"` or `"connecting"` during one. The draft's `linkUp` was a weak signal even before it was removed.

### 4.4 Polling cadence

`setInterval(tick, 1000)`. A device's state cannot change faster than the wallpad polls it — `min(DEVICE_POLL_MS) = 1,860 ms` — so a 1 s differ observes every distinct value the bus produces.

Each tick, in order: recompute staleness → publish any changed per-device availability → publish the state tree if its serialisation changed → publish a door event if `doorOpenCount` increased.

**No decoder notification hook.** That would mean running subscriber code inside `push()` — the RX hot path that also computes `lastSilentQueryAtMs` (the send gate) and feeds the capture append. A slow or throwing subscriber there is a bus fault, not a UI fault. There is no emitter to extend.

**Door counter seeding** — §2.3's `?? 0` fix; publish nothing on the first tick. `resetGeneration()` does not recreate `devices`, so the counter is monotonic across relinks; still guard with `>`.

---

## 5. Transport

### 5.1 Broker credentials — Supervisor, no new options

Add `"services": ["mqtt:want"]` to `config.json`. Regex-enforced: `RE_SERVICE = ^(?P<service>mqtt|mysql):(?P<rights>provide|want|need)$`. `want` over `need`: 0.4.2 ships today as a working page-only add-on, and `need` would have Supervisor refuse to start it on an install with no broker.

```ts
const res = await fetch("http://supervisor/services/mqtt", {
  headers: { Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}` },
});
```

`fetch` is a Node 24 global. `supervisor` is an unconditional `/etc/hosts` entry (`DockerApp.network_mapping` → `extra_hosts`), not a permission. **Do not add `hassio_api: true`** — `/services.*` is on the token-bypass list (`_V1_PATTERNS.api_bypass`), so a plain add-on token reaches it, and the flag would additionally open every `ROLE_DEFAULT` path for no benefit. Use the **unversioned (v1)** path, which is indifferent to the `addon` → `app` field rename dated 2026.05.

Response is `{"result":"ok","data":{…}}` per `SCHEMA_SERVICE_MQTT`:

| field | type | note |
|---|---|---|
| `host` | str | required |
| `port` | int | required |
| `username` | str | **optional, no default — may be absent** |
| `password` | str | **optional, no default — may be absent** |
| `ssl` | bool | default false |
| `protocol` | str | default `"3.1.1"`, one of `"3.1"`/`"3.1.1"` — never 5 |

Validate defensively (`typeof data.host === "string"`, `Number.isInteger(data.port)`): `/services` is not in the public Supervisor endpoint documentation, so the source is the only authority and the schema can change without a doc-visible announcement. **Set the CONNECT username/password flags from presence, not truthiness** — `username ?? ""` breaks an anonymous broker.

Three distinct failures, only one of which means "no broker":

| status | message | meaning | response |
|---|---|---|---|
| 403 | `No access to mqtt service!` | `services:` missing from config.json | a bug — log loudly |
| 400 | `Service not enabled` | nothing provides MQTT | **stay dark**, log once, **retry on a 60 s timer** |
| 404 | `Service does not exist` | typo'd path | a bug |

The 60 s retry is a change from the draft, and it deletes a support case: Supervisor does not restart an add-on when a service later becomes available, so *install this add-on → install Mosquitto → wonder why no entities appeared* was a permanent dark state until a manual restart. Five lines.

With Mosquitto the answer is `{host:"core-mosquitto", port:1883, ssl:false, protocol:"3.1.1", username:"addons", password:"<64 chars>"}` — the username is **`addons`**, not `homeassistant`; the latter is what Mosquitto publishes to HA's own integration and is the wrong account for an add-on. `addons` has unrestricted topic access (`auth_opt_http_aclcheck_uri /acl` answered by `return 200`), so no ACL work is needed.

Worth logging separately: **broker credentials are not the same thing as discovery working.** If HA's own `mqtt` config entry does not exist, retained payloads sit on the broker and no entity appears.

### 5.2 The client — there is no acceptable dependency, so it is hand-rolled. Ranked, unsoftened.

The image forbids npm and MQTT needs a client. Three real options:

**Option 1 — hand-rolled MQTT 3.1.1 in `src/mqtt.ts`. CHOSEN.**
Cost, honestly: **650–800 lines you own every bug in**, plus 350–500 lines of test harness (a byte-at-a-time socket stub, a CONNACK-code harness, a fake Supervisor `fetch`, a synthetic device tree). You maintain a protocol codec forever. Reassembly and keep-alive are the parts that bite.
Buys: zero transitive surface, no package manager in the Dockerfile, four allowlist edits, reuse of the `node:net` transport the add-on already uses for the EW11, and no change to `test/addon-image.test.ts`. The zero-dependency rule is narrower than it sounds — it bans package managers in the Dockerfile (`test/m2.test.ts:874` asserts `/(npm|yarn|pnpm)\s+(install|add)/` is false), not third-party source — so this is a judgement, not a technicality.

**Option 2 — vendor jdiamond/MQTT.ts (MIT, the only genuine zero-dependency TS 3.1.1 client).**
Cost: ~21 files / ~2,360 lines, last pushed 2023-01-11, unmaintained, and its imports are `from "../packets/connect.ts"`. `addon-image.test.ts`'s closure walker matches only `/from\s+"\.\/([A-Za-z0-9.-]+\.ts)"/g` — no slashes, no parent paths. Vendored under `src/mqtt/` those files are **invisible to the walker**, so the coverage assertion passes while covering none of them: exactly the green-suite-dead-add-on failure that test exists to prevent, which is how 0.3.0 died. Vendored flat, they trip the orphan assertion. **Either way `test/addon-image.test.ts` must be rewritten** — the one file the draft promised would not change. Plus twenty allowlist entries in the Dockerfile and `.dockerignore`. (The Sewertronics fork has no LICENSE at all.)
Buys: less code you wrote, more code you did not read.

**Option 3 — take `mqtt` from npm and delete the guard.**
Cost: **sixteen runtime dependencies**, a package manager in a Dockerfile that has none, a lockfile, `node_modules` in the image, a transitive supply chain reaching a bus that can close a gas valve — and deleting the test that has caught two real image regressions. `mqtt-packet` alone still pulls three.
Buys: a maintained, correct client and none of the codec risk.

Ranking is 1 > 2 > 3. Option 2 loses to 1 because its only advantage — not writing the codec — is paid for by rewriting the test that protects the deploy, on unmaintained code. Option 3 is last not because npm is wrong in general but because *this* image's whole safety story is "every module the entry point imports is in the image, and a test proves it," and option 3 trades that for convenience on a device class where the worst outcome is physical.

**Scope of the hand-rolled client:** CONNECT (protocol name `MQTT`, level 4, clean session, keep-alive 60 s, optional username/password by presence, Will `{topic: BASE/status, payload: "offline", retain: true, qos: 0}` — the Will lives in the CONNECT variable header and cannot be added later); CONNACK with per-code handling; PUBLISH out at QoS 0 with the retain flag; PUBLISH in at QoS 0 and 1 with **the retain bit exposed to the dispatcher**, and PUBACK for QoS 1; SUBSCRIBE/SUBACK; PINGREQ at keep-alive/2 with a **PINGRESP watchdog**; DISCONNECT; TCP stream reassembly; reconnect that replays subscriptions and the retained publish set.

**CONNACK codes must be split, or a refusing broker becomes an infinite log spinner:**

| code | meaning | action |
|---|---|---|
| 0x00 | accepted | proceed |
| 0x01 | unacceptable protocol version | **fatal** — stop, log, never retry |
| 0x02 | identifier rejected | **fatal** — log (fixed clientId collision) |
| 0x03 | server unavailable | ordinary reconnect |
| 0x04 / 0x05 | bad credentials / not authorised | **re-fetch `/services/mqtt`**, then reconnect — Mosquitto regenerates `/data/system_user.json` on reinstall. **Cap the refetches at 5, then back off to the 60 s timer**, or a persistently wrong credential is an unbounded Supervisor API poll. |

Check `ssl` and `protocol` from the service data *before* connecting rather than discovering them from a refusal.

**Reassembly is the hard part, not the framing.** The fixed header is 1 type/flags byte plus a 1–4 byte variable-length integer; a packet can split mid-varint. `decodeLength` must return `null` when the buffer ends mid-varint rather than throwing. Test it with a stub that writes **one byte at a time**, including a >127-byte publish so the length field itself is two bytes. `parseFrames`' carry-forward is the pattern to copy.

**The one failure mode that produces stale-but-live on the MQTT half**, and the draft specified the mechanism without testing it: on a silently dropped TCP path (NAT reap, host sleep, a bridge container restarting) Node emits no `close` and no `error`. Without a **PINGRESP timeout** the bridge sits on a zombie socket publishing into the void while HA holds the retained tree and the retained `online` and shows every entity as available and current, indefinitely. Test 16 covers it.

**Deliberate ceilings, each with a `ponytail:` comment:**

- **TLS: not implemented.** `ssl: true` → log once, stay dark. `node:tls` is stdlib and the swap is ~5 lines, but a broker publishing `ssl: true` almost certainly has a self-signed certificate; `rejectUnauthorized: false` is worse than nothing and a proper CA path is another knob. Mosquitto hard-codes `ssl "^false"` in what it publishes to the Supervisor, so this is a theoretical branch today. Add it when someone has one.
- No QoS 2. No outbound QoS 1 — everything outbound is retained or idempotent; a lost non-retained event is one missed door notification. Inbound QoS 1 **is** supported, because a dropped command is worse.
- **Inbound QoS 1 can duplicate an elevator call.** At-least-once is at-least-once; a lost PUBACK gets a DUP redelivery, `intentKey` coalescing only collapses requests that overlap in flight, and a redelivery seconds later is a second car the neighbours see. Gas-close and batch-off are idempotent, so this is elevator-only. **Therefore the two `button` components take `qos: 0` explicitly**, overriding the root — a lost press is a press the operator repeats; a duplicated call is not.
- No SUBACK return-code check — a `0x80` refusal is silently ignored. Matters only on a broker with ACLs; `addons` has none.
- No wildcard filter matching in the client: one message sink, the bridge switches on the topic string.
- Fixed 5 s reconnect, no backoff or jitter. Fixed `clientId` `bestium-eco-foret`.
- **No `enum` or `const enum` anywhere in `src/mqtt.ts`.** Node 24 runs these files by type-stripping and a packet-type enum — the most natural thing to reach for in an MQTT codec — throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` at import. Use `const PACKET = {...} as const`.

**MQTT over WebSocket is rejected.** Mosquitto does run `listener 1884 / protocol websockets` by default, but its discovery script hard-codes `port "^1883"` in what it publishes to the Supervisor, so `/services/mqtt` never advertises 1884. Choosing WS means hard-coding a port the service API does not give you. And WS is additive, not substitutive: identical codec, still PINGREQ, still reassembly.

**QoS on the wire.** Publishing discovery at QoS 1 buys nothing — HA subscribes to discovery at QoS 0 and MQTT delivers at `min(publish, subscription)`. Reliability comes from retain plus birth-triggered republish. The `"qos": 1` at the payload root is a different thing: the QoS the *entities* use for their own state and command topics.

---

## 6. Code layout and lifecycle

### 6.1 Files

**New: `bestium-eco-foret/src/mqtt.ts`**, one file, three layers, ~650–800 lines.

1. **Codec** (~140) — varint encode/decode, CONNECT/CONNACK/PUBLISH/PUBACK/SUBSCRIBE/SUBACK/PINGREQ/PINGRESP/DISCONNECT.
2. **Client** (~220) — `node:net`, reassembly, keep-alive + PINGRESP watchdog, reconnect, CONNACK dispatch, `onMessage(topic, payload, retain)`.
3. **Bridge** (~300) — `/services/mqtt` fetch with its retry, discovery builder, 1 s poll-and-diff over `polled`, command dispatcher, lifecycle.

One file, not three: each new module costs four coordinated edits (Dockerfile `COPY`, `.dockerignore` `!`, `DOCKERFILE_COPY_ALLOWLIST`, `DOCKERIGNORE_INCLUDES`). The codec is testable in isolation regardless — export its functions from this file.

**`import { createMqttBridge } from "./mqtt.ts";` must be a static top-level import.** `addon-image.test.ts` derives the runtime closure with `/from\s+"\.\/([A-Za-z0-9.-]+\.ts)"/g`. A `await import("./mqtt.ts")` — the natural "only load it when configured" instinct — is invisible to the walker, so the module would never be copied and the deploy would die at import exactly as 0.3.0 did. Conditional *construction* is fine; conditional *import* is not.

### 6.2 `m2.ts` — two edits, ~25 lines

After `await coordinator.openLink()` (m2.ts:2653), **not awaited, and guarded**:

```ts
// Not awaited: node's fetch has no default timeout, and awaiting a hung Supervisor would
// keep server.listen(8099) from ever running — a dead ingress panel for an optional feature.
// The env guard is also the "not running under Supervisor" branch, and it keeps the eight
// startM2Runtime call sites in link-recording.test.ts and m2.test.ts off the network.
const mqtt = process.env.SUPERVISOR_TOKEN
  ? createMqttBridge({
      version: JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version,
      commandsLive: settings.mqtt_commands_enabled === true && settings.transmit_enabled === true,
      getDevices: () => coordinator.getDevices(),
      send: (action) => tx.send(action, { mode: "live", userId: settings.transmit_user_id }),
      log: (line) => console.log(`[mqtt] ${line}`),
    }).catch((error) => { console.log(`[mqtt] disabled: ${String(error)}`); return null; })
  : null;
```

and in `stop()` (m2.ts:2698), before `tx.stop()`:

```ts
await (await mqtt)?.stop();   // retained `offline` to BASE/status, then DISCONNECT
```

**The version comes from `package.json`, not `config.json`** — this is the draft's third blocking error. `config.json` is **not in the image**: the Dockerfile copies `package.json` plus eight `src/*.ts` files, `.dockerignore` denies by default, and `test/m2.test.ts:882/891` asserts both lists as **exact sets**. `package.json` is copied and carries `version`, and `addon-image.test.ts` already enforces `config.json ≡ Dockerfile label ≡ package.json`. The draft's hard-coded `version: "0.5.0"` literal would have frozen `device.sw_version` forever with nothing to catch it. The device name and Korean title are not in `package.json`, so those stay literals — say so rather than claiming `config.json`.

A clean DISCONNECT suppresses the Will, so the explicit `offline` publish is required. **A clean shutdown must never publish an empty config** — that deletes the device and takes entity_id renames, area assignment, dashboard references and history continuity with it, every restart. Note `m2.ts:2710` does `void runtime.stop()` on SIGTERM unawaited, so a SIGKILL can cut it short — the broker then fires the Will and HA sees `offline` anyway. Same outcome.

**Connect sequence — order is load-bearing (§4.2):**

1. CONNECT with Will.
2. SUBSCRIBE `bestium-eco-foret/cmd/#` (QoS 1) and `homeassistant/status` (QoS 0). Subscribe to `cmd/#` even when `commandsLive` is false, so the dispatcher's guard is the single place the decision lives.
3. **`lastPublishedTree = null`** — force a full republish. Without this, a broker that restarted without persistence gets a fresh config and an empty state topic, and every entity sits at `unknown` until the next real bus change.
4. Publish the freshly computed per-device availability (`offline` at cold start, `online` on an MQTT-only reconnect) — retained.
5. Publish the state tree — retained.
6. Publish the discovery config — retained.
7. Publish `online` to `BASE/status` — retained. **Last.**

On `homeassistant/status` = `online`: wait a random 0–2,000 ms (the docs recommend jitter against a broker IO spike), then repeat 4–7. Belt to the retained config's braces: it covers a broker configured without persistence and an operator who changed the discovery prefix. `offline` there is logged and ignored. HA's own *retained* `online` is delivered on our own reconnect, so the sequence runs twice within ~2 s — harmless.

### 6.3 Command dispatcher

```
onMessage(topic, payload, retain):
  if topic === "homeassistant/status":
      if payload === "online" → schedule jittered republish; return
  if !topic.startsWith("bestium-eco-foret/cmd/") → return
  if !commandsLive → return                      // defence in depth
  if retain → log once, return                   // see below
  action = parse(topic, payload)
  if !action → log, return
  outcome = await send(action)                   // log only, never entity state
```

**The retain guard is the sharpest line in the file.** A broker replays retained messages to every new subscriber. If anything ever publishes retained to `.../cmd/gas`, the add-on re-executes it on every reconnect and every restart — permanently closing a valve a person must physically walk to and reopen. Same for `.../cmd/batch_off` and `.../cmd/elevator`. In MQTT 3.1.1 §3.3.1.3 the broker sets RETAIN=1 **only** when delivering a stored message on a new subscription and MUST clear it on live forwards, so the guard never drops a live command. `clean session: true` reinforces it: with no offline queue, a retained message is the only replay vector, so this one line closes the whole class. A library that hides the flag makes this invisible; hand-rolled, it is one line.

**And clear the poison.** After CONNECT and **before** SUBSCRIBE, publish a zero-length retained payload to each of the six `cmd/*` topics. The guard suppresses execution but nothing ever deletes a poisoned retained message — one Node-RED `mqtt out` node with the Retain checkbox set leaves a retained `CLOSE` on `cmd/gas` permanently, invisible, waiting for the guard to regress in a refactor or for a second consumer to appear. Ordering matters: clearing before subscribing means the bridge never receives its own clears.

**Parsing:**

| topic | payload | action |
|---|---|---|
| `cmd/light/<1-3>` | `ON`/`OFF` | `{kind:"light", target:n, state:"on"\|"off"}` |
| `cmd/heating/<1-4>/mode` | `heat`/`off` | `{kind:"heat", zone:n, state:"on"\|"off"}` |
| `cmd/heating/<1-4>/temperature` | number | `{kind:"heat", zone:n, temperatureC: Math.round(Number(payload))}` |
| `cmd/gas` | `CLOSE` | `{kind:"gas", state:"close"}` |
| `cmd/batch_off` | `ON`/`OFF` | `{kind:"batchoff", state:"on"\|"off"}` |
| `cmd/elevator` | `UP`/`DOWN` | `{kind:"elevator", direction:"up"\|"down"}` |

`Math.round` is required: HA renders climate setpoints as floats and `encodeSemanticAction` rejects a non-integer `temperatureC`. `temperature_command_template: "{{ value | int }}"` handles it HA-side; the round is the belt. `Math.round(Number("abc"))` → `NaN` → rejected. The 4 °C phantom is unreachable: `encodeSemanticAction` rejects `temperatureC < 5` before any frame is built.

Anything else is dropped with a log line. `encodeSemanticAction`'s `allowedFields` table is exact-match, so an extra key rejects the action — **build these objects literally, do not spread.**

### 6.4 What does not change

`tx-queue.ts` and `ui.ts` are untouched. `protocol-debug.ts` gains the five `polled` writes and nothing else (`test/protocol-debug.test.ts` gains one test).

**Reads** go through `coordinator.getDevices()` — already exposed, already read by `isConfirmed()`.

**Writes** go through the same `tx.send(action, {mode:"live", userId: settings.transmit_user_id})` the page uses. A second write path would bypass, in order: `intentKey()` coalescing, `isConfirmed()`, `tx_max_attempts` retries, the `inFlight` single-writer rule, `wouldCrossRecognized()` collision detection, and the silent-query gate wait.

Two sources commanding the same light do not race: `createIntentQueue().enqueue` replaces the value under an existing key and keeps its place, resolving the loser `{outcome:"superseded"}`, and `runIntent` re-checks `queue.has(entry.key)` before every attempt. A page press and an MQTT command on `light:1` collapse to one frame carrying the last request. Two consequences: **the bridge must not retry on `rejected`** (`tx_max_attempts` is already the retry policy; stacking a second multiplies frames on a half-duplex bus), and the operator's page banner will legitimately read `superseded` for a press an MQTT automation overtook. That is UI wording, not a bus fault.

**Redaction.** The ingress strips secrets through `redactDebug` (deletes any key matching `/ew11|host|port|user|challenge|token/i`, recursively) and `redactTx`. The MQTT publisher reads the device tree directly and passes through **neither**. It must therefore never put `ew11_host`, `ew11_port`, `transmit_user_id` or broker credentials into topic names, `unique_id` values, `device.identifiers` or payloads. Everything above is a fixed literal; keep it that way.

### 6.5 Config and manifest

```
config.json      + "services": ["mqtt:want"]
                 + "options": { …, "mqtt_commands_enabled": false }
                 + "schema":  { …, "mqtt_commands_enabled": "bool" }
                   "version": "0.5.0"
Dockerfile       + COPY src/mqtt.ts /app/src/mqtt.ts
                   LABEL io.hass.version="0.5.0"
.dockerignore    + !src/mqtt.ts
package.json       "version": "0.5.0"
settings.ts      + mqtt_commands_enabled: boolean  (parsed exactly like transmit_enabled;
                   DEFAULTS gets `mqtt_commands_enabled: false`)
```

`parseM2Settings` deliberately ignores stored values outside its explicit list — Supervisor merges add-on defaults *under* saved options, so an option not parsed explicitly is inert. Add `mqtt_commands_enabled` to `parseM2Settings` or it will never take effect.

Five allowlists in `test/m2.test.ts` assert **exact** key sets, not supersets:

```
CONFIG_TOP_KEYS            + "services"
CONFIG_OPTION_DEFAULT_KEYS + "mqtt_commands_enabled"
CONFIG_SCHEMA_KEYS         + "mqtt_commands_enabled"
DOCKERFILE_COPY_ALLOWLIST  + "src/mqtt.ts"
DOCKERIGNORE_INCLUDES      + "!src/mqtt.ts"
```

`test/addon-image.test.ts` needs **no** edit — it derives the closure from the imports, which is the point of it, and a static `from "./mqtt.ts"` matches the walker and satisfies the orphan assertion.

---

## 7. What the operator configures

**One new boolean: `mqtt_commands_enabled`, default `false`.** That is the whole panel change.

| knob the legacy had | where it comes from now |
|---|---|
| broker host / port / username / password / client_id | `GET /services/mqtt` |
| four TLS fields | not supported; stay dark and log |
| discovery prefix | `homeassistant`, hard-coded |
| publish interval | derived from `DEVICE_POLL_MS` |
| door auto-clear interval | does not exist — the `event` platform needs none |
| MQTT on/off | `mqtt:want` + auto-detect |

Twelve knobs replaced by one HTTP GET and one boolean. The legacy's defaults were the literal strings `username` and `password`, so its first run always failed authentication until the operator hand-copied a password — and the value most people copy is `homeassistant`, which is the wrong account for an add-on.

Documented as:

> When on, Home Assistant can operate the wallpad over MQTT. This includes closing the gas valve, which cannot be reopened from Home Assistant — a person must open it by hand at the valve — and calling the elevator, which the building offers no way to cancel. Requires 송신 허용 (`transmit_enabled`) and a 송신 사용자 (`transmit_user_id`) as well. 일괄소등 and the two elevator call buttons arrive disabled; enable them in the device page if you want them.

**DOCS must also carry these four, all measured, none of them mechanism defects:**

1. **Setting a heating target powers that zone on.** Eight of eight, all four zones. `climate.set_temperature` at 18 °C on a zone showing `off` — the exact call every night-setback automation makes — powers the zone on and burns gas. Restoring requires target-then-off, in that order. The poll reports `mode: heat` two seconds later, so HA stays truthful about a thing the operator did not ask for.
2. **The door event only fires when someone inside pressed the wallpad's door release.** It is not a general door-open sensor (§2.3).
3. **An elevator `unconfirmed` is expected** and must never be wrapped in an automation `repeat` (§2.2).
4. **Voice exposure arms `HassTurnOff → close_valve` on the gas valve** (§2.1). If you want a friendly refusal, that is an HA-side automation; MQTT discovery cannot express it.

**The residual risk, stated plainly.** The add-on's authority check is a configuration-equality check, not an identity check: `m2.ts:2645` is literally `getCurrentUserId: () => settings.transmit_user_id`, and `send()` requires `request.userId === settings.transmit_user_id`. An MQTT handler passing that id satisfies it **by construction**, because an MQTT PUBLISH carries no caller identity. So **anyone who can publish to the broker inherits the operator's full authority**, where the page requires an HA login plus a CSRF token. That is a property of the broker, not of this design. Mitigations: the knob defaults off; `transmit_enabled` must also be on and must name a user; the retain guard closes the replay hole; the three irreversible controls arrive disabled. It is not a knob to turn on for a broker exposed beyond the HA host.

---

## 8. Tests — `test/mqtt.test.ts` (+1 in `test/protocol-debug.test.ts`), `node --test`, no framework

| # | Asserts |
|---|---|
| 0 | **`protocol-debug.test.ts`**: feed the captured poll `f70d011b04431100040000b2ee` → `gas.polled.state === "open"`; then feed the captured direct reply `f70b011b0443110303b0ee` → `gas.state === "closed"` but **`gas.polled.state` still `"open"`**. Same shape for lights (`f70d011904401000020102b5ee` vs the targeted reply) and heating (`payload[4]===0x10` vs `addressed` 1–4). Frames lifted from existing fixtures, never hand-written. |
| 1 | Varint round-trip at 0, 127, 128, 321 (`[0xc1, 0x02]`, the spec's own example), 16,383, 16,384. |
| 2 | CONNECT bytes: `00 04 4D 51 54 54 04` + flags + keep-alive. Flags with credentials present vs **absent** (0x80/0x40 clear when the service data omits them), and with the Will set (0x04 + retain 0x20). |
| 3 | PUBLISH encode: retain bit in byte 0, no packet identifier at QoS 0, correct 2-byte length prefixes. |
| 4 | Reassembly: a broker stub writes CONNACK + two PUBLISHes (one 300 bytes, forcing a 2-byte remaining length) **one byte at a time**; both come out intact. |
| 5 | CONNACK 0x01 → no reconnect scheduled; 0x05 → credential re-fetch fired, and capped after 5; 0x03 → reconnect scheduled. |
| 6a | Discovery payload: root keys are exactly `{device, origin, qos, components}`; every component has `platform` and `unique_id`; no component carries both `availability` and `availability_topic`. |
| 6b | **Identifier freeze:** the sixteen `components` keys, the sixteen `unique_id`s, the topic `object_id` and `device.identifiers` as literal strings. A comment does not stop a rename; this does. |
| 7 | **`components.gas.payload_open === null`** when commands are live (`hasOwnProperty`, not `?? null`, not `undefined`), and `gas` has **no** `command_topic` when they are not. |
| 8 | Commands not live → no `command_topic`/`payload_press` anywhere, and `elevator_call_up`/`_down` are exactly `{"platform":"button"}`. |
| 9 | `enabled_by_default === false` on exactly `batch_off`, `elevator_call_up`, `elevator_call_down`, and absent everywhere else (including `gas`). |
| 10 | Diff: an unchanged tree publishes nothing; one light change publishes exactly one state message; a device whose `polled` is stale yields `"None"` and `offline` on its availability topic. |
| 11 | **Elevator idle** (`polled` fresh, `floorLabel: null`, `heading: "none"`, `call: "none"`) → `{"floor":"None","heading":"none","call":"none"}` and `avail/elevator` = `online`. **Pre-first-frame** → all three `"None"` and `avail/elevator` = `offline`. |
| 12 | Elevator floor byte `0xB1` → the tree publishes `"B1"`, never `177`. |
| 13 | Door: no event on the first tick; `doorOpenCount` absent → `1` fires **exactly one** publish of `{"event_type":"opened"}` with **retain false**; a second tick at the same count → nothing. |
| 14 | Dispatcher: a retained PUBLISH on `cmd/gas` → `send` **not** called; the same message live → `send` called once with `{kind:"gas", state:"close"}`. |
| 15 | `cmd/heating/2/temperature` with payload `"23.0"` → `{kind:"heat", zone:2, temperatureC:23}` (integer). |
| 16 | **PINGRESP watchdog:** a stub that accepts CONNECT then never answers PINGREQ → the client tears down and reconnects within `keepAlive` + margin. |
| 17 | Connect ordering: the recorded publish sequence is `cmd/*` clears → SUBSCRIBE → availability → state → config → `BASE/status` = `online` **last**; and `lastPublishedTree` is reset so the state topic republishes on every connect. |
| 18 | `/services/mqtt` returning 400 → bridge construction resolves to a dark bridge, no throw, `send` never wired, and a retry is scheduled at 60 s. |

**Realistic size, since the draft's estimate was not honest:** `src/mqtt.ts` 650–800 lines, `test/mqtt.test.ts` 500–700 (350–500 of it harness: a byte-at-a-time socket stub, a CONNACK harness, a fake Supervisor `fetch`, a synthetic device tree with `polled` and a door counter). Plus `m2.ts`, `settings.ts`, four manifest files, five allowlist entries, `protocol-debug.ts` and its test. **1,300–1,700 lines across 10 files.** Not 480 across 2.

---

## 9. Explicitly not doing

| Not doing | Why |
|---|---|
| **Group entities** (lights-all, heating-all) | Nothing on this bus reads "the group is on" — `0x19` addr `0x10` carries three per-lamp states, `0x18` addr `0x10` carries four per-zone slots. A group entity needs `optimistic: true` (violates §1 outright) or a synthesised state (invents a reading, and disagrees the moment one lamp changes at the wallpad). HA already addresses several entities in one action. If ever forced, `scene` is the only honest platform — command-only, no state. |
| **Group frames as a transport optimisation** | The tx-queue already coalesces per key; three lights are three keys and three frames, as the page sends today. Adding group coalescing is a second confirmation path (the heating group draws no direct reply and is confirmed only by a poll advanced to 161 ms) for a saving nobody measured. |
| **A "refresh"/"query now" command** | A frame on the line outside the silent-query gate. Everything readable is polled every 1.8–2.3 s. |
| **A decoder change-notification / event bus** | A 1 s differ observes every distinct value the bus produces. Adding one means subscriber code inside `push()`, the RX hot path that computes the send gate, for ≤1 s of latency. |
| **`expire_after` anywhere** | It produces `unavailable`, the wrong signal for both halves of the availability split, and it switches on the state-restore path and interacts badly with retained messages. The poll tells us exactly when a device stops reporting. |
| **A door `binary_sensor` alongside the event** | Two entities asserting the same fact with different lifetimes: the event says "opened at T" (measured), the binary_sensor says "open from T to T+N" (invented). That is how automations double-fire and a dashboard contradicts the logbook. |
| **The `gasAgrees` diagnostic sensor** | 268/268 agreement, 1,470–1,758 ms lag. A diagnostic for a fault that has never occurred. Add as `entity_category: "diagnostic"` if `0x1B` ever gets suspicious. |
| **`0x2A` as a second gas state source** | `0x1B` is the valve's own device and answers ~1.5 s sooner. Using both would flap during the lag window. Verified: the `0x2A` handler writes only `batchOff` plus `gasAgrees`, never `gas.state`. |
| **TLS to the broker / MQTT over WebSocket** | §5.2. |
| **Outbound QoS 1 / QoS 2 / un-acked replay** | Everything outbound is retained or idempotent. |
| **An ingress-page indicator for MQTT state** | "no broker" vs "broker but no HA MQTT integration" are usefully distinct, but surfacing them means touching `ui.ts` and its tests for information the add-on log already carries at startup. |
| **Per-device availability for the door** | Its state is a timestamp of a past event, which stays true whether or not the bus is up; `entrances.household` carries no staleness signal anyway. LWT only. |
| **A `BASE/avail/link` topic** | Redundant — generation-checked `polled` staleness on five devices already covers the link, and the elevator's own availability covers exactly the case that motivated it. |
| **Publishing outlet `0x1F`, ventilation `0x2B`, heating zones 5–8, communal entrance, subphone, vehicle, CCTV** | Queried and never answered, or absent entirely. |
| **A single-component → device-discovery migration path** | The add-on has never published MQTT. |
| **Publishing an empty config on shutdown** | That is *removal*, not shutdown: it deletes the device along with entity_id renames, area assignment, dashboard references and history continuity, every restart. Removal is uninstall-only — publish a zero-length retained payload to `homeassistant/device/bestium-eco-foret/config`, by hand. There is no MQTT 5 message-expiry at protocol level 3.1.1, so explicit removal is the only cure for a ghost. |
| **Deleting `protocol-debug.ts:522`'s vestigial `doorOpenObserved`** | Valid one-line cleanup, out of scope here. |

---

## Source files touched

- **New** `/Volumes/NT-1TB HD/Projects/homeassistant-bestium-eco-foret/bestium-eco-foret/src/mqtt.ts`
- **New** `/Volumes/NT-1TB HD/Projects/homeassistant-bestium-eco-foret/test/mqtt.test.ts`
- `/Volumes/NT-1TB HD/Projects/homeassistant-bestium-eco-foret/bestium-eco-foret/src/protocol-debug.ts` — five `polled` writes in the poll branches
- `/Volumes/NT-1TB HD/Projects/homeassistant-bestium-eco-foret/test/protocol-debug.test.ts` — one test (#0)
- `/Volumes/NT-1TB HD/Projects/homeassistant-bestium-eco-foret/bestium-eco-foret/src/m2.ts` — construct after line 2653 (unawaited, `SUPERVISOR_TOKEN`-guarded), `await (await mqtt)?.stop()` in `stop()` at ~2698, one static import
- `/Volumes/NT-1TB HD/Projects/homeassistant-bestium-eco-foret/bestium-eco-foret/src/settings.ts` — one boolean
- `/Volumes/NT-1TB HD/Projects/homeassistant-bestium-eco-foret/bestium-eco-foret/config.json`, `Dockerfile`, `.dockerignore`, `package.json`
- `/Volumes/NT-1TB HD/Projects/homeassistant-bestium-eco-foret/test/m2.test.ts` — five allowlist entries

Unchanged: `tx-queue.ts`, `ui.ts`, `test/addon-image.test.ts`.

---

# DECISIONS THE OPERATOR MUST MAKE

No research settles these. Each is a judgement about a physical building.

**1. Whether to enable `mqtt_commands_enabled` at all.**
Anyone who can publish to the broker inherits your full transmit authority, because an MQTT PUBLISH carries no caller identity and the add-on's check is configuration equality (§7). The page requires an HA login and a CSRF token; the broker requires whatever your broker requires. If the broker is reachable beyond the HA host, the honest answer is no — take the sixteen read-only entities and drive nothing.

**2. Whether to enable the elevator call buttons at all.**
They ship disabled. A call brings a shared car, the neighbours see it, and there is no cancel — not because we could not find one, but because the building does not offer one (operator-confirmed; three revoke sends drew nothing and M4-E150 records the revoke was never in a testable window). One press can put three frames on the bus when a neighbour's call already stands in the same direction, because confirmation is structurally impossible then. **A `button` gives Home Assistant no failure feedback.** If you enable them, put them behind a dashboard tile with `confirmation:` — MQTT discovery cannot express that, and the auto-generated Overview will otherwise render two bare PRESS tiles next to your light toggles.

**3. Whether to enable `batch_off`, and whether its `payload_off` should exist at all.**
This is the one where the design is making an assertion on your behalf. `measured-capabilities.md` §4 lists *"일괄소등이 조명 외에 무엇을 더 끄는지"* as **unmeasured**, and §2.1 records **two sends total** (95% lower bound: 5%). What was confirmed is that byte 9 of `0x2A` flips `01`↔`02`. **What was never measured is whether releasing restores the rooms the wallpad cannot otherwise reach.** Shipping a symmetric `payload_on`/`payload_off` pair asserts that OFF undoes ON. If it does not, `batch_off: ON` is exactly as irreversible as a gas close for every room with no other HA entity.

The measurement that settles it is one release with you standing where you can see those rooms. Until then: the entity ships disabled, and if you want it, decide whether you want the `payload_off` at all or only the readout.

**4. Whether to expose any of this to a voice assistant.**
`switch` is in `DEFAULT_EXPOSED_DOMAINS`; `valve` and `button` are not. If you bulk-expose this device in Settings → Voice assistants you arm two things: *"turn off everything in ⟨area⟩"* closes the gas valve (`HassTurnOff → close_valve`, verified, supported, irreversible), and *"turn on everything"* presses the elevator buttons. Neither requires saying the entity's name.

**5. The heating-target side effect, in your automations.**
Writing a target turns that zone on — eight of eight, all four zones. Every night-setback and schedule automation makes exactly that call. Decide whether your schedules should set targets on zones that are off, and remember the restore order is target-then-off.

**6. Whether the door event is worth an entity for you.**
It fires only when someone inside pressed the wallpad's door release. Not a keypad entry, not a key, not the bell — those are all on the subphone line (`0x7F`, 0 of 44,986 frames), which is out of scope. If what you wanted was "someone came home", this is not it.

---

---

# 사용자 결정 · 확정 (2026-08-31)

명세가 사용자 몫으로 남긴 여섯 항목에 답을 받았습니다. **네 항목에서 사용자는 권장안보다
넓은 쪽을 선택했고, 그 사실을 알고 선택했습니다.** 질문 본문에 각 위험이 명시되어 있었습니다.

| # | 결정 | 명세의 권장 | 설계에 미치는 영향 |
| --- | --- | --- | --- |
| 1 | **MQTT 명령 허용** | 읽기 전용으로 시작 | `mqtt_commands_enabled`는 여전히 기본 꺼짐으로 배포하고 사용자가 켭니다 |
| 2 | **일괄소등 걸기·풀기 모두 노출** | 먼저 측정하고 결정 | `payload_on`/`payload_off` 대칭 발행. **해제가 복원한다는 것을 설계가 단정합니다** |
| 3 | **승강기 호출 활성으로 포함** | 비활성 배포 | `enabled_by_default: true` |
| 4 | **음성 도우미 전부 노출** | 노출 안 함 | 아래 5번이 이 결정 때문에 생겼습니다 |
| 5 | **가스는 `valve` 유지, 음성에서만 제외** | (4번에 딸린 후속 질문) | 설계 변경 없음. **DOCS에 제외 절차를 명시**합니다 |
| 6 | ~~꺼진 존의 목표 변경을 막기~~ → **철회. 그대로 두고 문서화** | 그대로 두고 문서화 | 0.5.2에서 구현했다가 되돌렸습니다. 아래 참조 |
| 7 | **문열림 이벤트 노출** | 노출 | 변경 없음 |

## 6번은 철회되었습니다

**아래는 결정 당시의 기록이며, 사용자가 이후 철회했습니다.** 0.5.2가 차단을 구현했고 곧
되돌렸습니다. 아래에 적힌 대가 세 가지가 실제로 그대로 나타난 것이 철회의 이유입니다.
지금의 동작은 명세 본문이 원래 권장한 것, 곧 "그대로 두고 문서화"입니다.

## (철회된 기록) 6번이 명세를 바꿉니다

명세 §7은 난방 목표의 부수 효과를 문서로만 다루자고 했습니다. 사용자는 애드온이 막기를
택했습니다. 구현과 그 대가는 이렇습니다.

**구현**: MQTT 명령 디스패처가 `climate.set_temperature`를 받으면, 그 존의 `polled.state`를
보고 `off`이면 프레임을 만들지 않습니다.

**대가 셋, 전부 감수해야 합니다.**

1. **조용히 무시됩니다.** MQTT는 단방향이라 Home Assistant에 실패를 알릴 방법이 없습니다.
   자동화는 성공했다고 여기고, 다음 폴링에 목표가 원래 값으로 돌아온 것을 봅니다.
2. **웹 페이지와 동작이 갈립니다.** 페이지는 계속 월패드와 같이 동작해 꺼진 존의 목표를
   바꾸고 존을 켭니다. 같은 기기가 두 표면에서 다르게 반응합니다.
3. **월패드에서 되는 조작을 Home Assistant에서만 막는 것입니다.** 프로토콜의 성질이 아니라
   이 애드온의 정책입니다.

대안이었던 "목표를 쓴 뒤 곧 다시 끄기"는 버스에 프레임을 두 배로 싣고 존이 잠시 켜졌다
꺼지므로, 막기 쪽이 버스에 더 조용합니다.

## 2번과 4번이 남기는 것

**일괄소등**: `measured-capabilities.md` §4의 "일괄소등이 조명 외에 무엇을 더 끄는지"는
여전히 미측정입니다. 송신 총 2회로 확인된 것은 바이트 9가 `01`↔`02`로 뒤집힌다는 사실뿐이며,
**해제가 월패드로 닿지 못하는 방들을 복원하는지는 측정된 적이 없습니다.** 그 방들이 보이는
자리에서 해제를 한 번 보내는 측정이 이 공백을 닫습니다.

**음성**: 5번으로 가스는 막았지만 승강기는 남습니다. "전부 켜"가 호출 버튼을 누릅니다.
`button`은 실패를 알려 줄 방법이 없고 취소도 없으므로, 대시보드 타일에 `confirmation:`을
거는 것은 여전히 권장 사항입니다.

---

# WHAT REMAINS UNVERIFIED

Everything below is either untestable without a live broker, or reachable only by a measurement nobody has taken.

**Needs a live broker and a live HA:**

- **That HA accepts the payload at all.** The root schema is `PREVENT_EXTRA` and one bad key rejects all sixteen entities with a `_LOGGER.warning` and nothing else. Read the HA log on first publish; "no entities appeared" and "nothing was published" look identical from outside.
- **The PINGRESP watchdog against a real half-open socket.** Test 16 uses a stub that stops answering. A real NAT reap, host sleep, or bridge-container restart may present differently.
- **CONNACK 0x04/0x05 → refetch → reconnect** against a real Mosquitto reinstall that regenerated `/data/system_user.json`. The path is written from the source, never exercised.
- **The `/services/mqtt` response shape.** Not in the public Supervisor endpoint documentation. `SCHEMA_SERVICE_MQTT` is the only authority and can change without a doc-visible announcement — hence the defensive validation.
- **That `{"platform":"button"}` is a clean no-op on a fresh install where nothing exists to remove.** The *form* is doc-prescribed and correct (*"adding the `platform` (`p`) option is still required"*); the untested edge is the fresh-install case, not the mechanism.
- **Byte-at-a-time reassembly against a real broker's write patterns**, as opposed to the stub.

**Unmeasured on the bus, and named as such in `measured-capabilities.md` §4:**

- **Whether releasing batch-off restores the unreachable rooms.** See operator decision 3. This is the single most consequential gap in the whole design.
- **What else 일괄소등 switches off besides lights.**
- **Whether the device rejects a heating target above 40 °C.** The tool blocks it, so this is unmeasured by choice; the operator confirms the wallpad also snaps back.
- **The elevator 호기 field `0b`.** One car, so it cannot mean "car 11". The legacy uses it as an MQTT entity index without interpreting it. Not published.
- **Why elevator variant 0 draws nothing** while variant 1 works, against a legacy default of 0.
- **Whether a call can be cancelled on other estates.** Our three revoke sends drew nothing and this building offers no cancel, but those are two different kinds of evidence and neither says the frame is meaningless elsewhere.
- **Everything about the entrance beyond the door-release notification.** Needs the subphone line first.

**Sample sizes, because "it works" and "it always works" are different claims:**

194 gated sends, 0 observed failures — but per-frame the samples are wildly uneven. 40+ for lamp 1 on/off; 4–5 for lamps 2–3, the light group, and per-zone heating off; **1–3 for most heating targets, the heating group, batch-off, gas and the elevator.** The 95% lower bound for a single success is 5%. The gas close — the one irreversible control — has **n=2**. A close that does not take is well inside the measured uncertainty, which is exactly why §1's `polled` change matters: without it, HA is shown `closed` for ~1.4 s on evidence that cannot distinguish "received" from "took effect".

**Not verified, and deliberately not:**

- Whether `cover` drops OPEN on `payload_open: null` the way `valve` does. Do not assume it transfers.
- Google's and Alexa's default filter behaviour for manually-configured `google_assistant:` / `alexa:` YAML. Treat as unhedged risk if you use them.
- Whether omitting a component key (rather than the `{"platform": …}` form) removes it. The source suggests yes; the docs prescribe the other form; we use the doc-prescribed one and never find out.
