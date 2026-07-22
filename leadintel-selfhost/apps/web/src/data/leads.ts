export interface TouchEntry {
  date: string;
  type: string;
  summary: string;
  outcome: string;
  rep: string;
}

export interface Lead {
  id: number;
  name: string;
  phone: string;
  stage: string;
  source: string;
  lastTouch: number;
  daysSince: number;
  touches: number;
  motivation: string;
  situation: string;
  notes: string;
  assignedTo: string;
  daysInStage: number;
  value: number;
  dealValue: number;
  address: string;
  touchHistory: TouchEntry[];
  // Optional raw fields surfaced for the Today view priority formula + rationale.
  // Existing tabs that don't read these are unaffected.
  ghlContactId?: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
  sellerDisposition?: string | null;
  niche?: string | null;
  pipelineStageId?: string | null;
  pipelineStageName?: string | null;
  estimatedEquity?: number | null;
  marketValue?: number | null;
  lastContactAt?: string | null;
  lastInboundAt?: string | null;
  /** When the contact first appeared in GHL. Lets the Today list exempt
   *  brand-new leads from the "seller has replied" gate. */
  createdAt?: string | null;
  openTaskCount?: number;
  overdueTaskCount?: number;
  mostOverdueDays?: number | null;
  // Weight-3 custom fields synced from GHL (snake_case to mirror DB columns).
  seller_disposition?: string | null;
  seller_temperature?: string | null;
  last_offer_date?: string | null;
  last_offer_feedback?: string | null;
  last_offer_type?: string | null;
  last_offer_made?: number | null;
  timeline?: string | null;
  asking_price?: number | null;
  condition?: string | null;
  // `motivation` (above) is a derived bucket ("urgent"/"high"/...).
  // `motivation_text` is the raw GHL custom field value.
  motivation_text?: string | null;
  seller_note?: string | null;
  lead_identity?: string | null;
  lead_source?: string | null;
  personality_type?: string | null;
  niche_motivation?: string | null;
  campaign_name?: string | null;
  follow_up_due_date?: string | null;
  auction_date?: string | null;
  has_notes?: boolean;
  last_contact_days?: number | null;
  tasks?: { is_overdue: boolean }[];
}

export interface CallLogEntry {
  leadId: number;
  disposition: string;
  note: string;
  timestamp: string;
}

export interface RankedLead {
  id: number;
  priority: number;
  urgency: string;
  callType: string;
  reason: string;
  openingLine: string;
}

export interface HotLead {
  id: number;
  signal: string;
}

export interface PipelineHealth {
  score: number;
  grade: string;
  activeLeads: number;
  staleLeads: number;
  urgentLeads: number;
  avgDaysSinceContact: number;
  summary: string;
  topIssue: string;
}

export interface DailyBriefingData {
  greeting: string;
  bullets: string[];
  criticalAlert?: string;
}

export interface AIResult {
  dailyBriefing: DailyBriefingData;
  rankedLeads: RankedLead[];
  hotLeads: HotLead[];
  dropRecommendations: { id: number; reason: string }[];
  pipelineHealth: PipelineHealth;
}

export interface LeadIntelData {
  summary?: string;
  sentiment?: string;
  riskFactors?: string[];
  leveragePoints?: string[];
  recommendations?: { action: string; priority: string; type: string }[];
  openingLine?: string;
  talkingPoints?: string[];
  error?: string;
}

export interface Settings {
  ghl: { connected: boolean; apiKey: string; subAccountId: string };
  slack: { connected: boolean; webhookUrl: string; channel: string; dailyBriefing: boolean; hotAlerts: boolean };
  zapier: { connected: boolean; webhookUrl: string };
  sheets: { connected: boolean; sheetUrl: string; autoSync: boolean };
  twilio: { connected: boolean; sid: string; authToken: string; fromNumber: string };
  deepgram: { connected: boolean; apiKey: string };
  aiModel: string;
  priorityWeights: Record<string, number>;
  openingLineStyle: string;
  autoRefresh: string;
  intelligenceDepth: string;
  voiceWelcome: boolean;
  company: { name: string; userName: string; email: string; timezone: string };
  teamMembers: { name: string; email: string; phone: string; role: string; status: string; leads: number }[];
  pipelineStages: { name: string }[];
  leadSources: { name: string }[];
}

export const ALL_STAGES = [
  "New Lead",
  "Contacted",
  "Interested / Warm",
  "Appointment Set",
  "Needs Underwriting",
  "Offer Sent",
  "Under Contract",
  "Closed Deal",
  "Follow-Up",
  "Dead / Not Interested",
];

export const LEADS: Lead[] = [
  { id:1, name:"Dorothy M.", phone:"(602) 555-0142", stage:"Interested / Warm", source:"Probate", lastTouch:1, daysSince:1, touches:2, motivation:"high", situation:"Probate - mother passed 6 weeks ago, free and clear, 3 siblings deciding", notes:"Very warm on first call. Said she needs sibling sign-off. Has not listed.", assignedTo:"Marcus D.", daysInStage:4, value:165000, dealValue:0, address:"4821 Elm St, Phoenix AZ",
    touchHistory:[
      { date:"Apr 7", type:"outbound-call", summary:"Follow-up call — she was warm and said the siblings are meeting this weekend to make a final decision together", outcome:"connected", rep:"Marcus D." },
      { date:"Apr 3", type:"outbound-call", summary:"Initial contact — introduced the cash offer process, she said she needs sibling sign-off before moving forward but seemed genuinely interested", outcome:"connected", rep:"Marcus D." },
    ]},
  { id:2, name:"Susan K.", phone:"(602) 555-1156", stage:"Interested / Warm", source:"Pre-foreclosure", lastTouch:2, daysSince:2, touches:4, motivation:"urgent", situation:"Pre-foreclosure - auction in 22 days, has equity, keeps saying she needs more time", notes:"Answers every call but stalls. Time she does not have.", assignedTo:"Marcus D.", daysInStage:8, value:172000, dealValue:0, address:"4430 N 7th St, Phoenix AZ",
    touchHistory:[
      { date:"Apr 6", type:"outbound-call", summary:"Called to follow up on offer — she answered but said she is still thinking and mentioned a family member she wants to talk to first", outcome:"connected", rep:"Marcus D." },
      { date:"Apr 3", type:"outbound-call", summary:"Walked through the offer on the call — she acknowledged the auction timeline but said she needs more time, pattern of stalling continues", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 31", type:"outbound-call", summary:"Second contact — confirmed equity position ($172k ARV vs. auction payoff), she seemed overwhelmed by the foreclosure process", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 28", type:"outbound-call", summary:"Initial outreach — confirmed property ownership and auction date, she was surprised by how close the deadline is", outcome:"voicemail", rep:"Marcus D." },
    ]},
  { id:3, name:"Darnell W.", phone:"(404) 555-0231", stage:"New Lead", source:"PPC", lastTouch:0, daysSince:0, touches:0, motivation:"unknown", situation:"PPC lead overnight - filled cash offer form, 3bed/2bath in Decatur GA", notes:"Submitted at 11:42pm. High intent language on form.", assignedTo:"Jada R.", daysInStage:0, value:0, dealValue:0, address:"882 Flat Shoals Ave, Decatur GA",
    touchHistory:[]},
  { id:4, name:"Carlos R.", phone:"(480) 555-0287", stage:"Offer Sent", source:"Pre-foreclosure", lastTouch:3, daysSince:3, touches:5, motivation:"urgent", situation:"Pre-foreclosure - 47 days to auction, owes $112k, ARV $190k, opened offer email", notes:"Opened the offer email twice. Has not responded. Clock is ticking.", assignedTo:"Marcus D.", daysInStage:3, value:190000, dealValue:0, address:"1140 W Oak Ave, Tempe AZ",
    touchHistory:[
      { date:"Apr 5", type:"email-sent", summary:"Sent formal cash offer PDF — he opened the email twice within 3 hours but has not called back or responded in any way", outcome:"no-reply", rep:"Marcus D." },
      { date:"Apr 3", type:"outbound-call", summary:"Walked through the offer number verbally — he seemed receptive and said he would review the written offer when it arrived", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 31", type:"outbound-call", summary:"Second call — confirmed 47 days to auction, he sounded anxious about the timeline and asked if we could close before the auction date", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 28", type:"outbound-call", summary:"Follow-up — confirmed equity position, owes $112k against $190k ARV, he acknowledged the gap and seemed interested", outcome:"voicemail", rep:"Marcus D." },
      { date:"Mar 25", type:"outbound-call", summary:"Initial contact — confirmed pre-foreclosure status, property details, and that he has not hired an attorney yet", outcome:"voicemail", rep:"Marcus D." },
    ]},
  { id:5, name:"Angela D.", phone:"(602) 555-1378", stage:"Interested / Warm", source:"Signal Sniping", lastTouch:3, daysSince:3, touches:3, motivation:"high", situation:"Signal hit - 2 years behind on taxes, code violations, wants out fast", notes:"Very motivated. Said she just wants to be done with it. Has not listed.", assignedTo:"Marcus D.", daysInStage:3, value:148000, dealValue:0, address:"9901 S 48th St, Phoenix AZ",
    touchHistory:[
      { date:"Apr 5", type:"outbound-call", summary:"Substantive call — confirmed 2 years of unpaid taxes and active code violations, she said she just wants to be done with it and asked about our closing timeline", outcome:"connected", rep:"Marcus D." },
      { date:"Apr 2", type:"outbound-call", summary:"Second contact — she confirmed the tax lien amount and asked how quickly we could close if she decided to move forward", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 31", type:"outbound-call", summary:"Initial contact from signal hit — confirmed property ownership and the distress situation, she was receptive but cautious on first call", outcome:"voicemail", rep:"Marcus D." },
    ]},
  { id:6, name:"Marcus L.", phone:"(404) 555-0512", stage:"Offer Sent", source:"Divorce List", lastTouch:4, daysSince:4, touches:4, motivation:"urgent", situation:"Court-ordered sale, 60 days to comply per judge, both parties motivated by deadline", notes:"Attorney confirmed timeline. Both parties ready but nervous.", assignedTo:"Jada R.", daysInStage:4, value:198000, dealValue:0, address:"1740 Donald Lee Hollowell Pkwy, Atlanta GA",
    touchHistory:[
      { date:"Apr 4", type:"outbound-call", summary:"Three-way call with both parties — attorney confirmed the 60-day court deadline, both parties said they need a few days to review the written offer", outcome:"connected", rep:"Jada R." },
      { date:"Apr 2", type:"email-sent", summary:"Sent formal written offer to both parties and their attorney as required by the court order", outcome:"no-reply", rep:"Jada R." },
      { date:"Mar 28", type:"outbound-call", summary:"Conference call with both parties — confirmed the judge-imposed 60-day sale deadline and that neither wants to face contempt", outcome:"connected", rep:"Jada R." },
      { date:"Mar 25", type:"outbound-call", summary:"Initial contact with Marcus — confirmed the divorce proceedings, court-ordered sale, and that both parties have retained an attorney", outcome:"connected", rep:"Jada R." },
    ]},
  { id:7, name:"Billy R.", phone:"(214) 555-0156", stage:"New Lead", source:"Direct Mail", lastTouch:0, daysSince:0, touches:0, motivation:"unknown", situation:"Returned postcard, left voicemail saying he has been thinking about selling", notes:"First contact needed today. Message sounded motivated.", assignedTo:"Tyler K.", daysInStage:0, value:0, dealValue:0, address:"5892 Maple Ave, Dallas TX",
    touchHistory:[]},
  { id:8, name:"James T.", phone:"(623) 555-0834", stage:"Offer Sent", source:"Tired Landlord", lastTouch:5, daysSince:5, touches:6, motivation:"high", situation:"Tired landlord, bad tenant just left, owes zero, wants fast close", notes:"Loved offer verbally. Running by daughter. No callback yet.", assignedTo:"Marcus D.", daysInStage:5, value:178000, dealValue:0, address:"2241 W Glendale Ave, Phoenix AZ",
    touchHistory:[
      { date:"Apr 3", type:"outbound-call", summary:"No answer — left voicemail reminding him the offer is still on the table and we can hold it for a few more days", outcome:"voicemail", rep:"Marcus D." },
      { date:"Apr 1", type:"outbound-call", summary:"He called back and said the offer sounds great but wants his daughter to weigh in — she lives out of state, he will talk to her this week", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 28", type:"email-sent", summary:"Sent formal cash offer PDF with two closing timeline options — 14 days or 30 days at his preference", outcome:"no-reply", rep:"Marcus D." },
      { date:"Mar 25", type:"outbound-call", summary:"Walked through the offer number — he said it was fair and that the bad tenant situation has him ready to be done with the property", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 21", type:"outbound-call", summary:"Second call — confirmed the bad tenant vacated last month, property is free and clear, he explicitly said he wants a fast close", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 18", type:"outbound-call", summary:"Initial contact — confirmed ownership, free and clear status, and that the tenant situation has been ongoing for over a year", outcome:"voicemail", rep:"Marcus D." },
    ]},
  { id:9, name:"Antoine B.", phone:"(786) 555-0309", stage:"Interested / Warm", source:"Probate", lastTouch:4, daysSince:4, touches:2, motivation:"high", situation:"Probate, free and clear condo, sole heir, wants to close before year end", notes:"Very motivated. Said call back this week to move forward.", assignedTo:"Sofia M.", daysInStage:4, value:285000, dealValue:0, address:"1800 Biscayne Blvd, Miami FL",
    touchHistory:[
      { date:"Apr 4", type:"outbound-call", summary:"Follow-up call — he confirmed he wants to close before year end and asked about our closing process and timeline", outcome:"connected", rep:"Sofia M." },
      { date:"Mar 31", type:"outbound-call", summary:"Initial contact — confirmed he is the sole heir, the condo is free and clear, and he is eager to sell quickly to avoid carrying costs", outcome:"connected", rep:"Sofia M." },
    ]},
  { id:10, name:"Robert H.", phone:"(602) 555-0933", stage:"Follow-Up", source:"Pre-foreclosure", lastTouch:14, daysSince:14, touches:4, motivation:"medium", situation:"Pre-foreclosure, reinstated once before, said call back in 2 weeks", notes:"He specifically said call back in 2 weeks. That window is today.", assignedTo:"Marcus D.", daysInStage:14, value:245000, dealValue:0, address:"3340 E McDowell Rd, Phoenix AZ",
    touchHistory:[
      { date:"Mar 25", type:"outbound-call", summary:"He said he needs exactly two weeks to figure out his situation and explicitly requested a callback — that window is now", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 18", type:"outbound-call", summary:"Discussed reinstatement options — he reinstated once before and is considering doing it again but unsure", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 11", type:"outbound-call", summary:"Second contact — confirmed the foreclosure situation is ongoing and that he has limited options", outcome:"voicemail", rep:"Marcus D." },
      { date:"Mar 4", type:"outbound-call", summary:"Initial contact — confirmed pre-foreclosure status, seemed reluctant but willing to hear options", outcome:"connected", rep:"Marcus D." },
    ]},
  { id:11, name:"Carmen V.", phone:"(954) 555-0744", stage:"Offer Sent", source:"Divorce List", lastTouch:5, daysSince:5, touches:4, motivation:"high", situation:"Divorce - wife cooperative, husband stalling, both on title, Fort Lauderdale condo", notes:"She wants to sell fast. He is dragging feet. Need to get both.", assignedTo:"Sofia M.", daysInStage:5, value:320000, dealValue:0, address:"3001 N Ocean Blvd, Fort Lauderdale FL",
    touchHistory:[
      { date:"Apr 3", type:"email-sent", summary:"Sent offer to both parties — wife acknowledged receipt immediately, husband has not responded", outcome:"no-reply", rep:"Sofia M." },
      { date:"Apr 1", type:"outbound-call", summary:"Called wife — she is fully on board and frustrated with husband's inaction, asked if we could close with just her signature (we cannot)", outcome:"connected", rep:"Sofia M." },
      { date:"Mar 28", type:"outbound-call", summary:"Reached husband briefly — he acknowledged the situation but said he is not in a rush, contradicting the wife's urgency", outcome:"connected", rep:"Sofia M." },
      { date:"Mar 25", type:"outbound-call", summary:"Initial contact with Carmen — confirmed divorce, both on title, she wants a fast sale, property is a Fort Lauderdale condo", outcome:"connected", rep:"Sofia M." },
    ]},
  { id:12, name:"Denise C.", phone:"(702) 555-0613", stage:"Interested / Warm", source:"Pre-foreclosure", lastTouch:3, daysSince:3, touches:3, motivation:"urgent", situation:"Pre-foreclosure - 31 days to auction, has equity ~$130k, nervous but engaged", notes:"She is nervous but engaged. Needs hand holding.", assignedTo:"Chris W.", daysInStage:3, value:245000, dealValue:0, address:"6200 W Tropicana Ave, Las Vegas NV",
    touchHistory:[
      { date:"Apr 5", type:"outbound-call", summary:"Walked her through the process step by step — she is nervous but acknowledged she wants to protect her equity before the auction wipes it out", outcome:"connected", rep:"Chris W." },
      { date:"Apr 2", type:"outbound-call", summary:"Confirmed 31 days to auction — she knows she has equity in the $130k range and asked whether a cash sale could actually close before auction", outcome:"connected", rep:"Chris W." },
      { date:"Mar 30", type:"outbound-call", summary:"Initial outreach — confirmed pre-foreclosure, property ownership, and the situation; she was guarded but stayed on the phone", outcome:"voicemail", rep:"Chris W." },
    ]},
  { id:13, name:"Sandra M.", phone:"(972) 555-0293", stage:"Interested / Warm", source:"Pre-foreclosure", lastTouch:6, daysSince:6, touches:3, motivation:"urgent", situation:"Pre-foreclosure, 38 days to auction, owes $89k, ARV $195k, cousin is a realtor", notes:"Scared but hesitant. Cousin complicating the decision.", assignedTo:"Tyler K.", daysInStage:6, value:195000, dealValue:0, address:"7711 N MacArthur Blvd, Irving TX",
    touchHistory:[
      { date:"Apr 2", type:"outbound-call", summary:"She is scared but her cousin is advising her to list traditionally — cousin believes a 60-day listing can beat our cash offer, which is unlikely given 38 days to auction", outcome:"connected", rep:"Tyler K." },
      { date:"Mar 30", type:"outbound-call", summary:"Left voicemail explaining the difference between a cash sale timeline and traditional listing given the 38-day auction deadline", outcome:"voicemail", rep:"Tyler K." },
      { date:"Mar 26", type:"outbound-call", summary:"Initial contact — confirmed foreclosure status, she acknowledged the pressure but immediately brought up that her cousin is a realtor and wants to help", outcome:"connected", rep:"Tyler K." },
    ]},
  { id:14, name:"Nancy V.", phone:"(480) 555-1590", stage:"Follow-Up", source:"Probate", lastTouch:7, daysSince:7, touches:5, motivation:"medium", situation:"Probate, small mortgage, 3 adult children deciding together, called back twice no answer", notes:"Last voicemail said call back this week.", assignedTo:"Marcus D.", daysInStage:12, value:187000, dealValue:0, address:"2205 N Dobson Rd, Chandler AZ",
    touchHistory:[
      { date:"Apr 1", type:"outbound-call", summary:"Third attempt this week — left voicemail saying we are here when the family is ready and to call back before end of week", outcome:"voicemail", rep:"Marcus D." },
      { date:"Mar 28", type:"outbound-call", summary:"Called again — no answer, left message asking how the sibling discussions are going", outcome:"voicemail", rep:"Marcus D." },
      { date:"Mar 22", type:"outbound-call", summary:"Connected with Nancy — all 3 kids are in discussions, she said they need more time but sounded genuinely interested in moving forward", outcome:"connected", rep:"Marcus D." },
      { date:"Mar 15", type:"outbound-call", summary:"No answer — left a detailed voicemail explaining the probate cash sale process and how we handle the estate paperwork", outcome:"voicemail", rep:"Marcus D." },
      { date:"Mar 8", type:"outbound-call", summary:"Initial contact — confirmed probate status, small mortgage remaining, and that three adult siblings all need to agree before moving forward", outcome:"connected", rep:"Marcus D." },
    ]},
  { id:15, name:"Frank O.", phone:"(702) 555-0492", stage:"Offer Sent", source:"Absentee Owner", lastTouch:6, daysSince:6, touches:4, motivation:"high", situation:"CA investor, LV property vacant, losing $2k/mo, comparing us with one other buyer", notes:"Offer sent. Said he is comparing. Needs a nudge.", assignedTo:"Chris W.", daysInStage:6, value:287000, dealValue:0, address:"4580 W Flamingo Rd, Las Vegas NV",
    touchHistory:[
      { date:"Apr 2", type:"outbound-call", summary:"He confirmed he received our offer and is comparing with one other buyer — said he will make a decision by end of week, has not called back", outcome:"connected", rep:"Chris W." },
      { date:"Mar 30", type:"email-sent", summary:"Sent formal written offer with a side-by-side breakdown of cash sale vs. holding cost projections at $2k/month carrying expense", outcome:"no-reply", rep:"Chris W." },
      { date:"Mar 27", type:"outbound-call", summary:"Walked through offer terms — he responded positively and specifically mentioned the $2k/month vacancy cost as his main pain point", outcome:"connected", rep:"Chris W." },
      { date:"Mar 24", type:"outbound-call", summary:"Initial contact — confirmed property vacant 14 months, he manages everything remotely from Los Angeles and is tired of the headaches", outcome:"connected", rep:"Chris W." },
    ]},
  { id:16, name:"Keisha B.", phone:"(678) 555-0388", stage:"Interested / Warm", source:"Probate", lastTouch:5, daysSince:5, touches:2, motivation:"high", situation:"Probate - father passed, free and clear, sole heir, very warm but emotional", notes:"Motivated but needs time to process. Called her back once.", assignedTo:"Jada R.", daysInStage:5, value:224000, dealValue:0, address:"2341 Candler Rd, Decatur GA",
    touchHistory:[
      { date:"Apr 3", type:"outbound-call", summary:"Follow-up call — she is emotionally processing the loss but said she does want to sell and asked about how quickly we could close and what the process looks like", outcome:"connected", rep:"Jada R." },
      { date:"Mar 29", type:"outbound-call", summary:"Initial contact — father recently passed, she is the sole heir of a free and clear property, very warm and open on first call but clearly still grieving", outcome:"connected", rep:"Jada R." },
    ]},
  { id:17, name:"Harold J.", phone:"(214) 555-0421", stage:"Offer Sent", source:"Absentee Owner", lastTouch:3, daysSince:3, touches:5, motivation:"high", situation:"Out of state owner, property vacant 14 months, tired of remote management", notes:"Said our offer is fair. Confirming with wife. No callback.", assignedTo:"Tyler K.", daysInStage:3, value:163000, dealValue:0, address:"1414 Commerce St, Dallas TX",
    touchHistory:[
      { date:"Apr 5", type:"outbound-call", summary:"No answer — left voicemail asking about his wife's feedback on the offer and reminding him the number is still on the table", outcome:"voicemail", rep:"Tyler K." },
      { date:"Apr 3", type:"outbound-call", summary:"He said the offer seems fair and he needs to run it by his wife first — sounded genuinely positive, just wants her buy-in before committing", outcome:"connected", rep:"Tyler K." },
      { date:"Apr 1", type:"email-sent", summary:"Sent formal offer with a net proceeds breakdown comparing cash sale vs. continued holding costs on a vacant property", outcome:"no-reply", rep:"Tyler K." },
      { date:"Mar 28", type:"outbound-call", summary:"Walked through the offer concept verbally — he responded well and asked about the closing timeline and whether we handle all the paperwork", outcome:"connected", rep:"Tyler K." },
      { date:"Mar 24", type:"outbound-call", summary:"Initial contact — confirmed property has been vacant 14 months, he manages it remotely from out of state and is burned out on ownership", outcome:"connected", rep:"Tyler K." },
    ]},
  { id:18, name:"Tanya R.", phone:"(770) 555-0641", stage:"Follow-Up", source:"Tired Landlord", lastTouch:10, daysSince:10, touches:3, motivation:"medium", situation:"Tired landlord, 3 units, one vacant, wants to liquidate all 3 together", notes:"Interested but only sells all 3 as a package.", assignedTo:"Jada R.", daysInStage:10, value:310000, dealValue:0, address:"3800 Campbellton Rd, College Park GA",
    touchHistory:[
      { date:"Mar 29", type:"outbound-call", summary:"She reiterated she will only sell all 3 units as a package — not interested in partial offers, but open to discussing the right bulk buyer if we can find one", outcome:"connected", rep:"Jada R." },
      { date:"Mar 22", type:"outbound-call", summary:"Left voicemail asking about her timeline and whether she is still open to discussing a package offer for all three properties", outcome:"voicemail", rep:"Jada R." },
      { date:"Mar 15", type:"outbound-call", summary:"Initial contact — confirmed 3 rental units, one currently vacant, she is exhausted from tenant management and wants to exit everything at once", outcome:"connected", rep:"Jada R." },
    ]},
  { id:19, name:"Margaret B.", phone:"(602) 555-0799", stage:"Follow-Up", source:"Divorce List", lastTouch:21, daysSince:21, touches:4, motivation:"medium", situation:"Divorce - court ordered sale, both parties hard to reach, attorney involved", notes:"Attorney confirmed 90-day window. Running out of time.", assignedTo:"Marcus D.", daysInStage:21, value:210000, dealValue:0, address:"6615 E Camelback Rd, Scottsdale AZ",
    touchHistory:[
      { date:"Mar 18", type:"outbound-call", summary:"Left voicemail for both parties — no response, but their attorney replied by email saying they are reviewing options and will be in touch", outcome:"voicemail", rep:"Marcus D." },
      { date:"Mar 11", type:"outbound-call", summary:"Tried both parties again — no answer on either line, left detailed voicemail explaining the urgency of the 90-day court window", outcome:"voicemail", rep:"Marcus D." },
      { date:"Mar 1", type:"outbound-call", summary:"Reached husband briefly — confirmed the attorney is involved, the 90-day window is real, and said he would pass along our contact info to the attorney", outcome:"connected", rep:"Marcus D." },
      { date:"Feb 15", type:"outbound-call", summary:"Initial contact with Margaret — confirmed the court-ordered sale, she seemed open but said the attorney handles all communications regarding the property", outcome:"connected", rep:"Marcus D." },
    ]},
  { id:20, name:"Tyler M.", phone:"(702) 555-0218", stage:"New Lead", source:"PPC", lastTouch:0, daysSince:0, touches:0, motivation:"unknown", situation:"PPC form submission - inherited property in Las Vegas, unsure what to do", notes:"Submitted form at 2am. High urgency language.", assignedTo:"Chris W.", daysInStage:0, value:0, dealValue:0, address:"3150 S Nellis Blvd, Las Vegas NV",
    touchHistory:[]},
];
