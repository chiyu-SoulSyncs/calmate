/**
 * 挨拶文メーカー - メッセージ生成ロジック
 *
 * 日本のビジネスメールの正しい構成:
 *   1. 宛名（会社名 → 部署名 → 役職 → 氏名＋様）
 *   2. 本文（挨拶 → 要件 → 詳細）
 *   3. 結びの言葉
 *   4. 署名区切り線（-- または ────）
 *   5. 署名（会社名 → 部署名 → 役職 → 氏名）の順
 *      ※ 肩書き（役職）は氏名の前に置くのが正式
 *
 * シーン:
 *   - intro       : グループ参加の自己紹介
 *   - thanks      : ミーティングお礼
 *   - reminder    : ミーティングリマインド
 *   - next        : 次回案内（日程調整依頼）
 *   - reply       : 返信（かしこまりました系）
 */

export type GreetingScene = "intro" | "thanks" | "reminder" | "next" | "reply";
export type GreetingTone = "formal" | "casual" | "friendly";

export interface ProfileCard {
  id: number;
  label: string;
  name: string;
  company?: string | null;
  role?: string | null;
}

export interface MeetingInfo {
  purpose?: string;
  date?: string;   // 例: "9月12日 (金曜日)"
  time?: string;   // 例: "午後7:00〜8:00"
  url?: string;
  nextAction?: string;  // 弊社対応事項
  theirAction?: string; // 貴社対応事項
}

export interface GreetingSlot {
  date: string;   // 例: "9月9日 (火曜日)"
  time: string;   // 例: "午後4:00〜5:00"
}

export interface GenerateGreetingOptions {
  scene: GreetingScene;
  tone: GreetingTone;
  profile: ProfileCard;
  meeting?: MeetingInfo;
  slots?: GreetingSlot[];
  recipientName?: string;
}

// ─────────────────────────────────────────────
// 署名ヘルパー
// ─────────────────────────────────────────────

/**
 * 日本のビジネスメール署名の正しい順序:
 *   会社名
 *   部署名・役職名（肩書き）
 *   氏名
 *
 * 例:
 *   株式会社○○
 *   営業部 マネージャー
 *   田中 太郎
 */
function signature(profile: ProfileCard, tone: GreetingTone): string {
  if (tone === "friendly") {
    // タメ口：署名区切りなし、名前のみ
    return profile.name;
  }

  const lines: string[] = [];
  // 1. 会社名（最上位）
  if (profile.company) lines.push(profile.company);
  // 2. 役職・肩書き（氏名の前）
  if (profile.role) lines.push(profile.role);
  // 3. 氏名（最後）
  lines.push(profile.name);

  // 署名区切り線付き
  return `────────────────\n${lines.join("\n")}`;
}

/**
 * 本文冒頭の挨拶文
 * 正式なビジネスメールでは「お世話になっております。」の後に
 * 「会社名の氏名です。」と名乗るのが正式
 */
function openingGreeting(tone: GreetingTone, company: string, name: string): string {
  if (tone === "formal") {
    const companyStr = company ? `${company}の` : "";
    return `お世話になっております。\n${companyStr}${name}でございます。`;
  }
  if (tone === "casual") {
    const companyStr = company ? `${company}の` : "";
    return `お疲れ様です。\n${companyStr}${name}です。`;
  }
  // friendly
  return `お疲れ〜！\n${name}だよ。`;
}

function closing(tone: GreetingTone): string {
  if (tone === "formal") return "何卒よろしくお願いいたします。";
  if (tone === "casual") return "引き続きよろしくお願いします！";
  return "よろしくね！";
}

function meetingBlock(meeting: MeetingInfo): string {
  const lines: string[] = [];
  if (meeting.purpose) lines.push(`■目的：${meeting.purpose}`);
  if (meeting.date && meeting.time) lines.push(`■日時：${meeting.date}⋅${meeting.time}`);
  if (meeting.url) lines.push(`■URL：${meeting.url}`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────
// シーン別ビルダー
// ─────────────────────────────────────────────

function buildIntro(opts: GenerateGreetingOptions): string {
  const { profile, tone, recipientName } = opts;
  const company = profile.company ?? "";
  const name = profile.name;
  // 役職は自己紹介時に本文中に入れる（「○○部 マネージャーの田中です」形式）
  const roleStr = profile.role ? `${profile.role}の` : "";

  if (tone === "formal") {
    const to = recipientName ? `${recipientName}の皆様\n\n` : "";
    return `${to}はじめまして。\n${company}、${roleStr}${name}と申します。\n\nこれからどうぞよろしくお願いいたします。\n\n${signature(profile, tone)}`;
  }
  if (tone === "casual") {
    const to = recipientName ? `${recipientName}の皆さん\n\n` : "";
    return `${to}はじめまして！\n${company}、${roleStr}${name}です。\n\nよろしくお願いします！\n\n${signature(profile, tone)}`;
  }
  // friendly
  return `はじめまして〜！\n${roleStr}${name}です。\nよろしくね！\n\n${signature(profile, tone)}`;
}

function buildThanks(opts: GenerateGreetingOptions): string {
  const { profile, tone, meeting } = opts;
  const company = profile.company ?? "";
  const name = profile.name;
  const greet = openingGreeting(tone, company, name);

  if (tone === "formal") {
    let body = `${greet}\n\n本日は、お打ち合わせのお時間をいただき、誠にありがとうございました。\n打ち合わせで決まった内容を以下にまとめましたので、ご確認いただけますと幸いです。`;
    if (meeting) {
      const block = meetingBlock(meeting);
      if (block) body += `\n\n【次回会議】\n${block}`;
      if (meeting.nextAction) body += `\n\n【弊社で対応する事】\n${meeting.nextAction}`;
      if (meeting.theirAction) body += `\n\n【貴社にご対応頂きたいこと】\n▼下記のご対応をお願いいたします。\n${meeting.theirAction}`;
    }
    body += `\n\nその他、ご不明な点やご要望などございましたら、何なりとお申し付けくださいませ。\n${closing(tone)}\n\n${signature(profile, tone)}`;
    return body;
  }
  if (tone === "casual") {
    let body = `${greet}\n\n本日はお打ち合わせありがとうございました！`;
    if (meeting) {
      const block = meetingBlock(meeting);
      if (block) body += `\n\n【次回会議】\n${block}`;
      if (meeting.nextAction) body += `\n\n【弊社対応】\n${meeting.nextAction}`;
      if (meeting.theirAction) body += `\n\n【ご対応お願いしたいこと】\n${meeting.theirAction}`;
    }
    body += `\n\n${closing(tone)}\n\n${signature(profile, tone)}`;
    return body;
  }
  // friendly
  let body = `さっきはありがとう！`;
  if (meeting?.nextAction) body += `\n\n【やること】\n${meeting.nextAction}`;
  body += `\n\n${closing(tone)}\n\n${signature(profile, tone)}`;
  return body;
}

function buildReminder(opts: GenerateGreetingOptions): string {
  const { profile, tone, meeting } = opts;
  const company = profile.company ?? "";
  const name = profile.name;
  const greet = openingGreeting(tone, company, name);

  if (tone === "formal") {
    let body = `${greet}\n\n次回のお打ち合わせについて、下記の通りご連絡申し上げます。`;
    if (meeting) {
      const block = meetingBlock(meeting);
      if (block) body += `\n\n${block}`;
    }
    body += `\n\nご不明点やご質問等ございましたら、お気軽にお申し付けくださいませ。\n${closing(tone)}\n\n${signature(profile, tone)}`;
    return body;
  }
  if (tone === "casual") {
    let body = `${greet}\n\n次回のお打ち合わせについてご連絡です！`;
    if (meeting) {
      const block = meetingBlock(meeting);
      if (block) body += `\n\n${block}`;
    }
    body += `\n\n${closing(tone)}\n\n${signature(profile, tone)}`;
    return body;
  }
  // friendly
  let body = `次回の打ち合わせの件！`;
  if (meeting) {
    if (meeting.date && meeting.time) body += `\n● ${meeting.date}⋅${meeting.time}`;
    if (meeting.url) body += `\n🔗 ${meeting.url}`;
  }
  body += `\n\n${closing(tone)}\n\n${signature(profile, tone)}`;
  return body;
}

function buildNext(opts: GenerateGreetingOptions): string {
  const { profile, tone, slots } = opts;
  const company = profile.company ?? "";
  const name = profile.name;
  const greet = openingGreeting(tone, company, name);

  const slotsText = slots && slots.length > 0
    ? slots.map(s => `● ${s.date}⋅${s.time}`).join("\n")
    : "（日程を選択してください）";

  if (tone === "formal") {
    return `${greet}\n\n次回のお打ち合わせ日程を設定させていただきたく、ご連絡いたしました。\n\n以下の日時でご都合のよいお時間はございますでしょうか。\nお手数ですが、ご確認いただけますと幸いです。\n\n${slotsText}\n\nその他、ご不明点やご要望などございましたら、何なりとお申し付けくださいませ。\n${closing(tone)}\n\n${signature(profile, tone)}`;
  }
  if (tone === "casual") {
    return `${greet}\n\n次回の打ち合わせ日程についてご連絡です！\n\n以下の日程でご都合はいかがでしょうか？\n\n${slotsText}\n\nご確認よろしくお願いします！\n\n${signature(profile, tone)}`;
  }
  // friendly
  return `次回の日程なんだけど、どれかいける？\n\n${slotsText}\n\n${closing(tone)}\n\n${signature(profile, tone)}`;
}

function buildReply(opts: GenerateGreetingOptions): string {
  const { profile, tone } = opts;

  if (tone === "formal") {
    return `ご連絡ありがとうございます。\nかしこまりました。\n次回日程につきまして、改めてご連絡させていただきます。\n引き続きよろしくお願いいたします。\n\n${signature(profile, tone)}`;
  }
  if (tone === "casual") {
    return `ご連絡ありがとうございます！\n了解しました。\nまたご連絡しますね。\n引き続きよろしくお願いします！\n\n${signature(profile, tone)}`;
  }
  return `了解〜！\nまた連絡するね。\n\n${signature(profile, tone)}`;
}

// ─────────────────────────────────────────────
// メイン関数
// ─────────────────────────────────────────────

export function generateGreeting(opts: GenerateGreetingOptions): string {
  switch (opts.scene) {
    case "intro":    return buildIntro(opts);
    case "thanks":   return buildThanks(opts);
    case "reminder": return buildReminder(opts);
    case "next":     return buildNext(opts);
    case "reply":    return buildReply(opts);
    default:         return "";
  }
}
