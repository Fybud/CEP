import { prisma } from "../config/db.js";
import { sendWhatsAppTemplateMessage } from "./MessagingService.js";

const RUN_INTERVAL_MS = 60 * 1000; // 1 minute

async function runScheduler() {
  try {
    // Find jobs that are pending and either not scheduled or scheduled for past
    const jobs = await prisma.broadcastJob.findMany({
      where: {
        status: "pending",
        pausedAt: null,
        cancelledAt: null,
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: new Date() } }
        ]
      }
    });

    for (const job of jobs) {
      await processJob(job);
    }
  } catch (err) {
    console.error("BroadcastScheduler error:", err);
  }
}

async function processJob(job: any) {
  try {
    const recipients = await prisma.broadcastRecipient.findMany({
      where: { jobId: job.id, status: "pending" }
    });

    let succeeded = job.succeeded || 0;
    let failed = job.failed || 0;

    for (const recipient of recipients) {
      // Check if paused or cancelled mid-job
      const currentJobState = await prisma.broadcastJob.findUnique({ where: { id: job.id } });
      if (currentJobState?.pausedAt || currentJobState?.cancelledAt) {
        break; // Stop processing this job
      }

      await new Promise(r => setTimeout(r, 200));

      const customer = await prisma.customer.findUnique({ where: { id: recipient.customerId } });
      const customerName = customer?.name ?? "Customer";

      const variables = job.variables as Record<string, string>;
      const resolvedVariables: Record<string, string> = {};
      for (const [key, val] of Object.entries(variables)) {
        if (val === "$CONTACT_NAME") {
          resolvedVariables[key] = customerName;
        } else if (val === "$CONTACT_FIRST_NAME") {
          resolvedVariables[key] = customerName.split(" ")[0];
        } else if (val === "$AGENT_USERNAME") {
          resolvedVariables[key] = "Agent"; // Default fallback
        } else {
          resolvedVariables[key] = val;
        }
      }

      try {
        const result = await sendWhatsAppTemplateMessage({
          customerId: recipient.customerId,
          templateId: job.templateId,
          variables: resolvedVariables
        });

        if (result.result.ok) {
          succeeded++;
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "sent",
              messageId: result.result.externalId ?? null,
              error: null,
            },
          });
        } else {
          failed++;
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: "failed", error: result.result.error ?? "Unknown error" },
          });
        }
      } catch (err: any) {
        // Only count as failed when we never got a provider accept.
        // Persist/schema errors after a successful send are logged by MessagingService.
        const msg = err?.message ?? "Unknown error";
        failed++;
        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: "failed", error: msg },
        });
      }

      await prisma.broadcastJob.update({
        where: { id: job.id },
        data: { succeeded, failed }
      });
    }

    const currentJobState = await prisma.broadcastJob.findUnique({ where: { id: job.id } });
    if (!currentJobState?.pausedAt && !currentJobState?.cancelledAt) {
      const overallStatus = failed === 0 ? "completed" : succeeded === 0 ? "failed" : "partial";
      await prisma.broadcastJob.update({
        where: { id: job.id },
        data: { status: overallStatus, succeeded, failed }
      });
    }

  } catch (err) {
    console.error(`Failed to process job ${job.id}:`, err);
  }
}

export function startBroadcastScheduler() {
  setInterval(runScheduler, RUN_INTERVAL_MS);
  // Run immediately on boot
  runScheduler();
}
