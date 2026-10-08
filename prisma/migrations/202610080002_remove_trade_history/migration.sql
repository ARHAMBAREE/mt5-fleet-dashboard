-- Trade history is no longer collected. Preserve live account state.
UPDATE "alerts" SET "enabled" = false WHERE "type" = 'DAILY_LOSS_EXCEEDED';
DROP TABLE "deals";
