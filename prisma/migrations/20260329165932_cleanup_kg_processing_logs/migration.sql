-- Clean up ProcessingLog entries from deleted Knowledge Graph job
DELETE FROM "ProcessingLog" WHERE "processName" = 'external-metrics-collection';
