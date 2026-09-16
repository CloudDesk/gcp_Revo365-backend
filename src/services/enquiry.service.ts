import { appendToSheet, getISTTimestamp } from "../googleSheets/sheetsService.js";
import {
  insertEnquiryRecord,
  markEnquirySheetSynced,
} from "./enquiryDB.service.js";

// ─── Sheet tab names from environment ─────────────────────────────────────────
const CORPORATE_SHEET = process.env.ENQUIRY_CORPORATE_SHEET || "Corporate";
const INDIVIDUAL_SHEET = process.env.ENQUIRY_INDIVIDUAL_SHEET || "Individual";

export module enquiryService {

  /**
   * Handles corporate enquiry:
   * 1. Saves to DB (carbon copy / audit trail) — sheet_synced = false initially
   * 2. Appends row to "Corporate" Google Sheet tab
   * 3. Updates DB row with sheet_synced = true if sheet write succeeded
   *
   * Sheet columns (Corporate):
   * Timestamp | First Name | Last Name | Work Email | Phone | Company | Employee Count | Preferred Date | Notes | Status | Follow-up Notes
   */
  export const enquiryCorporate = async (request: any) => {
    try {
      const payload = request.body;
      console.log("Ecom Enquiry Payload:", payload);

      // ── Step 1: Save to Database (primary backup) ──────────────────────────
      const dbId = await insertEnquiryRecord({
        recordtype: "corporate",
        first_name: payload.firstName ?? "",
        last_name: payload.lastName ?? "",
        email: payload.email ?? "",
        phone: payload.phone ?? "",
        company: payload.company ?? "",
        fleet: payload.fleet ?? "",
        preferred_date: payload.date ?? "",
        notes: payload.notes ?? "",
        status: "Open",
        sheet_synced: false,
      });

      // ── Step 2: Append to Google Sheet ────────────────────────────────────
      const timestamp = getISTTimestamp();
      const rowData = [
        timestamp,
        payload.firstName ?? "",
        payload.lastName ?? "",
        payload.email ?? "",
        payload.phone ?? "",
        payload.company ?? "",
        payload.fleet ?? "",   // Employee Count
        payload.date ?? "",   // Preferred Date
        payload.notes ?? "",
        "Open",                      // Status — dropdown set by Apps Script
        "",                          // Follow-up Notes — admin fills manually
      ];

      await appendToSheet(CORPORATE_SHEET, rowData);

      // ── Step 3: Mark DB record as sheet_synced ────────────────────────────
      // appendToSheet never throws, but if it logged an error internally,
      // sheet_synced remains false in DB — useful for audit/retry.
      if (dbId !== null) {
        await markEnquirySheetSynced(dbId);
      }

      return {
        status: 200,
        message: "Ecom enquiry received",
      };
    } catch (error) {
      console.error("Query Execution Error: IN enquiryCorporate", error);
      return {
        status: 500,
        message: "Failed to process ecom enquiry",
      };
    }
  };

  /**
   * Handles individual enquiry:
   * 1. Saves to DB (carbon copy / audit trail) — sheet_synced = false initially
   * 2. Appends row to "Individual" Google Sheet tab
   * 3. Updates DB row with sheet_synced = true if sheet write succeeded
   *
   * Sheet columns (Individual):
   * Timestamp | First Name | Last Name | Email | Phone | Topic | Message | Status | Follow-up Notes
   */
  export const enquiryIndividual = async (request: any) => {
    try {
      const payload = request.body;
      console.log("Individual Enquiry Payload:", payload);

      // ── Step 1: Save to Database (primary backup) ──────────────────────────
      const dbId = await insertEnquiryRecord({
        recordtype: "individual",
        first_name: payload.firstName ?? "",
        last_name: payload.lastName ?? "",
        email: payload.email ?? "",
        phone: payload.phone ?? "",
        topic: payload.topic ?? "",
        message: payload.message ?? "",
        status: "Open",
        sheet_synced: false,
      });

      // ── Step 2: Append to Google Sheet ────────────────────────────────────
      const timestamp = getISTTimestamp();
      const rowData = [
        timestamp,
        payload.firstName ?? "",
        payload.lastName ?? "",
        payload.email ?? "",
        payload.phone ?? "",
        payload.topic ?? "",
        payload.message ?? "",
        "Open",                      // Status — dropdown set by Apps Script
        "",                          // Follow-up Notes — admin fills manually
      ];

      await appendToSheet(INDIVIDUAL_SHEET, rowData);

      // ── Step 3: Mark DB record as sheet_synced ────────────────────────────
      if (dbId !== null) {
        await markEnquirySheetSynced(dbId);
      }

      return {
        status: 200,
        message: "Individual enquiry received",
      };
    } catch (error) {
      console.error("Query Execution Error: IN enquiryIndividual", error);
      return {
        status: 500,
        message: "Failed to process individual enquiry",
      };
    }
  };
}
