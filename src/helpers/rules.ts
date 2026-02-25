import { DateTime } from "luxon";
import { GET } from "@action/database/database";
import { Availability } from "@service/catalog/meta.types";
import { config } from "@/ecosystem.config";

export async function rules(rule: { id: string; goal: string }): Promise<{ availability: Availability; type_goal: string }> {
  const today = DateTime.now();
  const last = today.endOf("month");
  const rest = Math.ceil(last.diff(today, "days").days);

  const { id, goal } = rule;
  const monthly_goal = parseInt(goal);

  const leads_today = await GET(config.database.leads, {
    where: {
      crm: id,
      created: {
        gte: today.startOf("day").toJSDate(),
        lte: today.endOf("day").toJSDate(),
      },
    },
  });
  const leads_today_count = leads_today.data.length;

  const leads_month = await GET(config.database.leads, {
    where: {
      crm: id,
      created: {
        gte: today.startOf("month").toJSDate(),
        lte: today.endOf("month").toJSDate(),
      },
    },
  });
  const leads_month_count = leads_month.data.length;

  const remaining_month = monthly_goal - leads_month_count;
  const daily_goal = rest > 0 ? Math.ceil(remaining_month / rest) : 0;

  if (leads_month_count >= monthly_goal) {
    return { availability: "out of stock", type_goal: "mensal" };
  }

  if (leads_today_count >= daily_goal) {
    return { availability: "in stock", type_goal: "diária" };
  }

  return { availability: "in stock", type_goal: "mensal" };
}