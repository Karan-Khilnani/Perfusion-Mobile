import { db } from "../db";
import { bookingSequences } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

function getFinancialYearInfo(date: Date = new Date()): { year: string; month: string } {
  const calendarYear = date.getFullYear();
  const calendarMonth = date.getMonth() + 1;

  let fyStartYear: number;
  let financialMonth: number;

  if (calendarMonth >= 4) {
    fyStartYear = calendarYear;
    financialMonth = calendarMonth - 3;
  } else {
    fyStartYear = calendarYear - 1;
    financialMonth = calendarMonth + 9;
  }

  const fyEndYear = (fyStartYear + 1) % 100;
  const year = `${fyStartYear}-${fyEndYear.toString().padStart(2, "0")}`;
  const month = financialMonth.toString().padStart(2, "0");

  return { year, month };
}

function getTypePrefix(bookingType: string): string {
  switch (bookingType) {
    case "lab": return "L";
    case "consultation": return "C";
    case "teleradiology": return "R";
    default: return "X";
  }
}

export async function generateBookingNumber(bookingType: string): Promise<string> {
  const { year, month } = getFinancialYearInfo();
  const typePrefix = getTypePrefix(bookingType);

  const result = await db
    .insert(bookingSequences)
    .values({ financialYear: year, sequence: 1 })
    .onConflictDoUpdate({
      target: bookingSequences.financialYear,
      set: { sequence: sql`${bookingSequences.sequence} + 1` },
    })
    .returning({ sequence: bookingSequences.sequence });

  const seq = result[0].sequence;
  const seqStr = seq.toString().padStart(5, "0");

  return `PHC/${year}/${month}/${typePrefix}${seqStr}`;
}
