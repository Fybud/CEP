# Ticket Creation Workflow

This document explains the various ways tickets can be created in the Customer Engagement Platform (CEP), the properties associated with them, and how they integrate into the broader system.

---

## 1. How Tickets Are Created

Currently, tickets are created **manually** by system users. There are two primary locations where this happens:

### A. From the Unified Inbox (Contextual Creation)
When an Agent or Manager is chatting with a customer in the Unified Inbox (via WhatsApp, Instagram, or Email) and realizes the issue cannot be solved in a single reply, they can create a ticket directly from the conversation.
- **How it works**: The user clicks the **"Create Ticket"** button inside the active conversation.
- **Benefit**: The system automatically links the ticket to that specific `customerId` and `conversationId`. This means whoever works on the ticket later will have direct access to the customer's chat history.

### B. From the Ticketing Dashboard (Standalone Creation)
Users can create independent tickets that aren't tied to an immediate, active chat (e.g., logging a backend system failure or a proactive outreach task).
- **How it works**: The user navigates to the **Tickets** page (`/tickets`) and clicks the **"New Ticket"** button.
- **Benefit**: Flexible creation of tasks and issues that can be assigned to specific teams or users for tracking.

### C. Future Feature: Rule Engine (Auto-Creation)
*Note: This feature is planned for Phase 3.*
The platform will soon support automated ticket creation. The backend Rule Engine will scan incoming customer messages for specific keywords (e.g., "refund", "broken", "complaint"). If a match is found, the system will automatically generate a ticket, assign it `HIGH` priority, and route it to the appropriate team (e.g., Billing or L2 Support) without any manual intervention.

---

## 2. Ticket Properties

When creating a ticket, the following fields are defined:

- **Subject** *(Required)*: A short, concise title summarizing the issue (e.g., "Refund Request for Order #991").
- **Description** *(Optional)*: Detailed context, steps to reproduce, or background information.
- **Priority**: Defaults to `MEDIUM`. Can be set to `LOW`, `MEDIUM`, `HIGH`, or `URGENT`. High-priority tickets visually stand out on the dashboard.
- **Team Assignment**: 
  - Admins can assign the ticket to *any* team.
  - Managers and Agents can *only* assign the ticket to their own team.
- **User Assignment**:
  - The ticket can be assigned directly to a specific user within the chosen team.
  - If left unassigned, it sits in the team's queue for any Agent to claim.
  - *Agents can only assign tickets to themselves.*

---

## 3. Internal Tracking (Audit Logs)

The moment a ticket is created, the system begins a strict audit trail.
- An immutable `TicketEvent` of type `CREATED` is instantly logged in the database.
- This event records exactly *who* created the ticket, at what time, and what the initial properties (team, priority) were.
- The UI renders this audit trail in the Ticket Details page, ensuring complete transparency and accountability for the ticket's entire lifecycle.
