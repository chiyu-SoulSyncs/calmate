/**
 * 挨拶文メーカー - メッセージ生成ロジック
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
// 挨拶・署名ヘルパー
// ─────────────────────────────────────────────

function greeting(tone: GreetingTone, company: string, name: string): string {
  if (tone === "formal") {
    return `お世話になっております。\n${company}の${name}です。`;
  }
  if (tone === "casual") {
    return `お疲れ様です！\n${company}の${name}です。`;
  }
  // friendly
  return `お疲れ〜！\n${name}だよ。`;
}

function signature(profile: ProfileCard, tone: GreetingTone): string {
  if (tone === "friendly") return profile.name;
  const parts: string[] = [];
  if (profile.company) parts.push(profile.company);
  if (profile.role) parts.push(profile.role);
  parts.push(profile.name);
  return parts.join("\n");
}

function closing(tone: GreetingTone): string {
  if (tone === "formal") return "今後ともよろしくお願いいたします。";
  if (tone === "casual") return "引き続きよろしくお願いします！";
  return "よろしくね！";
}

function meetingBlock(meeting: MeetingInfo): string {
  const lines: string[] = ["【会議情報】"];
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
  const roleStr = profile.role ? `（${profile.role}）` : "";

  if (tone === "formal") {
    const to = recipientName ? `${recipientName}の皆様\n\n` : "";
    return `${to}はじめまして。\n${company}の${name}${roleStr}と申します。\n\nこれからどうぞよろしくお願いいたします。\n\n${signature(profile, tone)}`;
  }
  if (tone === "casual") {
    const to = recipientName ? `${recipientName}の皆さん\n\n` : "";
    return `${to}はじめまして！\n${company}の${name}${roleStr}です。\n\nよろしくお願いします！\n\n${signature(profile, tone)}`;
  }
  // friendly
  return `はじめまして〜！\n${name}${roleStr}です。\nよろしくね！\n\n${signature(profile, tone)}`;
}

function buildThanks(opts: GenerateGreetingOptions): string {
  const { profile, tone, meeting } = opts;
  const company = profile.company ?? "";
  const name = profile.name;
  const greet = greeting(tone, company, name);

  if (tone === "formal") {
    let body = `${greet}\n\n本日は、お打ち合わせのお時間をいただき、ありがとうございました。\n今回の打ち合わせで決まったことを以下に記載いたします。`;
    if (meeting) {
      body += `\n\n${meetingBlock(meeting)}`;
      if (meeting.nextAction) body += `\n\n【弊社で対応する事】\n${meeting.nextAction}`;
      if (meeting.theirAction) body += `\n\n【貴社にご対応頂きたいこと】\n▼下記のご対応をお願いいたします。\n${meeting.theirAction}`;
    }
    body += `\n\nその他、ご不明な点やご要望などございましたら、何なりとお申し付けくださいませ。\n${closing(tone)}\n\n${signature(profile, tone)}`;
    return body;
  }
  if (tone === "casual") {
    let body = `${greet}\n\n本日はお打ち合わせありがとうございました！`;
    if (meeting) {
      body += `\n\n${meetingBlock(meeting)}`;
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
  const greet = greeting(tone, company, name);

  if (tone === "formal") {
    let body = `${greet}\n\n次回のお打ち合わせにつきまして、下記ご連絡申し上げます。`;
    if (meeting) body += `\n\n${meetingBlock(meeting)}`;
    body += `\n\nご不明点やご質問等ございましたら、お気軽にお申し付けくださいませ。\n何卒よろしくお願いいたします。\n\n${signature(profile, tone)}`;
    return body;
  }
  if (tone === "casual") {
    let body = `${greet}\n\n次回のお打ち合わせについてご連絡です！`;
    if (meeting) body += `\n\n${meetingBlock(meeting)}`;
    body += `\n\nよろしくお願いします！\n\n${signature(profile, tone)}`;
    return body;
  }
  // friendly
  let body = `次回の打ち合わせの件！`;
  if (meeting) {
    if (meeting.date && meeting.time) body += `\n📅 ${meeting.date} ${meeting.time}`;
    if (meeting.url) body += `\n🔗 ${meeting.url}`;
  }
  body += `\n\nよろしくね！\n\n${signature(profile, tone)}`;
  return body;
}

function buildNext(opts: GenerateGreetingOptions): string {
  const { profile, tone, slots } = opts;
  const company = profile.company ?? "";
  const name = profile.name;
  const greet = greeting(tone, company, name);

  const slotsText = slots && slots.length > 0
    ? slots.map(s => `● ${s.date}⋅${s.time}`).join("\n")
    : "（日程を選択してください）";

  if (tone === "formal") {
    return `${greet}\n\n次回のお打ち合わせ日を設定させて頂きたく、ご連絡させていただきました。\n\n以下の日時で、ご都合の宜しいお時間はございますでしょうか。\nお手数ではございますが、お知らせいただけますと幸いです。\n\n${slotsText}\n\nその他、ご不明点やご要望などございましたら、何なりとお申し付けくださいませ。\n${closing(tone)}\n\n${signature(profile, tone)}`;
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
    return `ご連絡ありがとうございます。\nかしこまりました。\n次回日程に関して、また連絡させていただきます。\n引き続きよろしくお願いいたします。\n\n${signature(profile, tone)}`;
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
