export type IndustryTemplateCode =
  | "manufacturing_after_sales"
  | "trade_sales"
  | "education_service"
  | "medical_device_service";

export type IndustryQualityCase = {
  question: string;
  expectedAnswer: string;
  shouldRefuse?: boolean;
};

export type IndustryTemplate = {
  code: IndustryTemplateCode;
  name: string;
  description: string;
  icon: string;
  themeColor: string;
  brandName: string;
  welcomeMessage: string;
  questions: string[];
  systemPrompt: string;
  demoDocumentName: string;
  demoText: string;
  qualityCases: IndustryQualityCase[];
};

export const INDUSTRY_TEMPLATES: Record<IndustryTemplateCode, IndustryTemplate> = {
  manufacturing_after_sales: {
    code: "manufacturing_after_sales",
    name: "制造业 / 产品售后",
    description: "产品选型、安装、故障排查、备件和保修服务",
    icon: "制",
    themeColor: "#5f46dc",
    brandName: "产品售后助手",
    welcomeMessage: "您好，我是产品售后助手。您可以咨询产品选型、安装使用、故障排查和保修政策。",
    questions: ["这款产品适合什么场景？", "设备出现故障怎么办？", "保修政策是什么？"],
    systemPrompt: "你是制造企业的产品与售后顾问。只能依据检索到的企业资料回答。优先给出明确结论、适用型号、操作步骤和注意事项；涉及价格、库存、交期、保修承诺或安全风险时，不得猜测。资料不足时明确说明，并建议客户留下需求或转人工。识别到采购、批量询价、代理合作等意向时，自然邀请客户提交联系方式。",
    demoDocumentName: "制造业售后演示资料.txt",
    demoText: `【演示资料：星川 M20 工业控制器】

一、适用场景
M20 工业控制器适用于包装产线、仓储输送线和小型自动化设备，不适用于防爆区域或户外淋雨环境。

二、安装要求
设备应安装在通风控制柜内，环境温度为 0 至 45 摄氏度。接线前必须断电，保护接地必须可靠连接。

三、故障处理
出现 E07 报警时，先断电 30 秒，再检查电机线缆是否松动。重新上电后仍报警，请记录设备序列号并联系售后，禁止自行拆机。

四、保修政策
M20 主机自签收之日起保修 24 个月，电源适配器保修 12 个月。进水、摔落、擅自拆机和错误接线造成的损坏不在保修范围。`,
    qualityCases: [
      { question: "M20 主机保修多长时间？", expectedAnswer: "24个月" },
      { question: "控制器显示 E07 应该先做什么？", expectedAnswer: "断电30秒" },
      { question: "M20 能不能装在露天环境？", expectedAnswer: "不适用于户外淋雨环境" },
    ],
  },
  trade_sales: {
    code: "trade_sales",
    name: "贸易 / 报价销售",
    description: "产品参数、起订量、样品、交期和代理合作",
    icon: "贸",
    themeColor: "#1677ff",
    brandName: "产品选型顾问",
    welcomeMessage: "您好，我可以帮您查询产品参数、选型建议、起订量和合作流程。",
    questions: ["如何选择合适的型号？", "批量采购怎么询价？", "交付和售后流程是什么？"],
    systemPrompt: "你是贸易企业的产品选型与销售顾问。严格依据企业资料介绍参数、差异、适用场景和合作流程，不虚构报价、库存、交期或认证。先理解客户用途、数量、地区和时间要求，再给出选型建议。遇到报价、样品、批量采购或代理合作意向时，引导客户留下联系方式，由销售人员确认。",
    demoDocumentName: "贸易销售演示资料.txt",
    demoText: `【演示资料：BluePeak 保温杯出口规则】

BP500 容量为 500ml，适合日常零售；BP750 容量为 750ml，适合户外和礼品采购。两款产品均为 304 不锈钢内胆。

标准颜色最低起订量为 100 件；定制颜色或印刷 Logo 最低起订量为 500 件。现货样品可在 3 个工作日内寄出，样品费和运费由销售人员按目的地确认。

批量订单的价格、库存和交期必须由销售人员根据数量、包装和收货国家书面确认。系统不得直接承诺最终报价。`,
    qualityCases: [
      { question: "做定制颜色最少订多少个？", expectedAnswer: "500件" },
      { question: "现货样品多久能寄出？", expectedAnswer: "3个工作日" },
      { question: "BP750 的容量是多少？", expectedAnswer: "750ml" },
    ],
  },
  education_service: {
    code: "education_service",
    name: "教育 / 课程咨询",
    description: "课程匹配、学习安排、试听、退课和人工咨询",
    icon: "教",
    themeColor: "#7c3aed",
    brandName: "课程咨询助手",
    welcomeMessage: "您好，我可以帮您了解课程内容、适合人群、学习安排和服务政策。",
    questions: ["这门课程适合谁？", "课程包含哪些内容？", "如何预约咨询？"],
    systemPrompt: "你是教育机构的课程咨询助手。严格依据机构资料说明课程内容、适合人群、学习安排和服务政策，不承诺考试结果、就业结果或未在资料中出现的优惠。先理解学习目标和基础，再提供匹配建议；资料不足时建议预约人工顾问。",
    demoDocumentName: "教育课程演示资料.txt",
    demoText: `【演示资料：启航数据分析入门课】

课程适合没有编程经验、希望掌握基础数据分析的在职人员和大学生。课程共 8 周，每周二、周四晚上 19:30 直播，每次 90 分钟，并提供 30 天回放。

课程内容包括 Excel 数据整理、SQL 基础查询、可视化报告和一个结课项目。报名后可预约一次 20 分钟课程顾问咨询。

开课前 48 小时可申请全额退款；开课后不承诺考试、就业或薪资结果，具体退课政策需由人工顾问确认。`,
    qualityCases: [
      { question: "课程一共学习几周？", expectedAnswer: "8周" },
      { question: "直播结束后还能看多久？", expectedAnswer: "30天" },
      { question: "什么时候申请可以全额退款？", expectedAnswer: "开课前48小时" },
    ],
  },
  medical_device_service: {
    code: "medical_device_service",
    name: "医疗器械 / 合规服务",
    description: "产品使用、维护、投诉受理和合规转人工",
    icon: "械",
    themeColor: "#0f8f78",
    brandName: "器械服务助手",
    welcomeMessage: "您好，我可以根据产品资料协助查询使用、维护和售后流程；诊疗问题请咨询专业医务人员。",
    questions: ["设备日常如何清洁？", "故障后如何报修？", "哪些问题必须转人工？"],
    systemPrompt: "你是医疗器械企业的产品服务助手。只能依据已审核的企业资料回答产品使用、维护、物流和售后流程。不得提供诊断、治疗建议，不得扩大产品适用范围，不得替代医务人员判断。遇到不良事件、患者伤害、禁忌症、超说明书使用或紧急情况，立即停止一般回答并建议联系专业人员和企业人工客服。",
    demoDocumentName: "医疗器械服务演示资料.txt",
    demoText: `【演示资料：CareOne C10 电子体温计服务说明】

C10 仅用于人体体温测量。每次使用后，用 75% 酒精棉片擦拭探头，禁止整机浸水或高温消毒。

无法开机时先更换一枚 CR2032 电池；更换后仍无法开机，请记录产品序列号并联系售后，禁止自行拆机。

产品自购买之日起保修 12 个月。若出现患者伤害、疑似不良事件、测量结果与临床表现明显不符或超说明书使用，应立即停止使用并转企业人工客服或专业医务人员处理。`,
    qualityCases: [
      { question: "C10 的探头怎么清洁？", expectedAnswer: "75%酒精棉片" },
      { question: "体温计保修多久？", expectedAnswer: "12个月" },
      { question: "出现疑似不良事件应该怎么办？", expectedAnswer: "立即停止使用" },
    ],
  },
};

export function listIndustryTemplates() {
  return Object.values(INDUSTRY_TEMPLATES);
}

export function getIndustryTemplate(value: unknown) {
  return typeof value === "string" && value in INDUSTRY_TEMPLATES
    ? INDUSTRY_TEMPLATES[value as IndustryTemplateCode]
    : null;
}
