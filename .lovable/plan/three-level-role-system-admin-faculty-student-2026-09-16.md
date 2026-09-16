# Three-level role system: Admin, Faculty, Student

Rebuild the account and permission model so nobody can pick their own role. Everyone who registers becomes a Student. Only the Admin can promote someone to Faculty or Admin.

## Roles and registration

- One shared registration form: Full name, Email, Student/Faculty ID, Department, Password, Confirm password. No role choice anywhere on it.
- Every new account is saved as a Student, enforced in the database (not just the form).
- The three homepage cards stay, but they only decide which sign-in screen you land on. The Faculty and Admin screens are sign-in only, no registration.
- `matalajahnavi@gmail.com` becomes the Admin. If that account exists it is promoted now; if not, it is promoted automatically the moment it registers.
- Existing faculty accounts keep their Faculty role, subjects and uploads.
- After signing in, people land on their own dashboard based on the role stored in the database.
- Forgot-password email and the reset page stay as they are.

## Admin dashboard

Sections: Overview, All Students, All Faculty, User Management, Role Management, Regulations, Subjects, Uploaded PDFs, Student Activity, Faculty Activity, Analytics, Edit Requests, Audit Logs.

The admin can:

- See every registered student and faculty member with their department, ID, regulation and join date.
- Change anyone's role between Student, Faculty and Admin (cannot demote their own account, so the system is never left without an admin).
- Deactivate and reactivate accounts. A deactivated account is signed out of everything it tries to open.
- Browse all subjects, all uploaded PDFs, and delete any material.
- Approve or reject student edit requests; approving applies the change to the student's profile automatically.
- See system-wide numbers: total users, students, faculty, admins, subjects, PDFs, views, downloads.
- Charts: students per regulation, PDFs per regulation, uploads per faculty member, most viewed subjects, most downloaded subjects.
- Read an audit log of every role change and account action: who did it, the affected user, old value, new value, timestamp.

## Faculty dashboard

Sections: My Profile, My Subjects, Add Subject, Upload PDF, Uploaded Materials, Student Engagement, Analytics.

- Add subjects with a subject code and regulation (code stays mandatory).
- Upload a PDF choosing regulation, subject, title and an optional description.
- Edit or delete their own subjects and materials only.
- Analytics for their own materials only: total views, total downloads, unique students who viewed, unique students who downloaded, plus bar charts by subject and by individual PDF.
- No access to the admin area, no role changes, no other faculty's data.

## Student dashboard

Sections: Dashboard, My Subjects, Academic Materials, My Profile.

- On first sign-in, choose a regulation (R25, R24, R23, R22).
- Only subjects and PDFs for that regulation are visible; search by subject code or material title.
- Open a PDF in the built-in viewer, download it.
- Profile is read-only. A "Request a change" form sends regulation / ID / department change requests to the admin.
- Every open records a view, every download records a download, stored with student, material, subject, faculty, regulation, type and timestamp.

## Security

Permissions are enforced in the database, not by hiding buttons:

- The role lives in its own table that no ordinary user can write to. Any attempt to change a role from the browser, the API, or dev tools is rejected.
- Role changes only happen through an admin-verified server operation that also writes the audit log entry.
- Students can only read their own profile, subjects and materials for their regulation, and can only record their own activity.
- Faculty can only read and write their own subjects, materials and engagement figures.
- Deactivated accounts lose read and write access to app data.

## Technical notes

Database migration:

- `profiles`: add `department`, `student_id`, `faculty_id`, `status` (active/disabled), `updated_at` + trigger. Regulation stays.
- `regulations` table (`code`, `label`) seeded with R25/R24/R23/R22; `subjects.regulation` and `materials.regulation` keep their text code and gain an FK to it.
- `materials`: add `description`.
- `material_events`: add `faculty_id`, `subject_id`, `regulation` (backfilled from the material) so activity queries don't need joins.
- New `audit_logs` (`admin_id`, `target_user_id`, `action`, `previous_value`, `new_value`, `created_at`) — insert only via the admin RPC, readable by admins.
- New `edit_requests` (`student_id`, `field`, `current_value`, `requested_value`, `status`, `reviewed_by`, `reviewed_at`) — students insert/read own, admins read/update all.
- `handle_new_user` trigger rewritten: always inserts role `student` and ignores any role in sign-up metadata; special-cases the bootstrap admin email. Copies full_name, department, student_id from metadata.
- `user_roles` keeps no INSERT/UPDATE/DELETE policies. Two SECURITY DEFINER functions: `admin_set_role(target, new_role)` and `admin_set_status(target, status)`, both re-checking `has_role(auth.uid(),'admin')`, both writing `audit_logs`. Granted to `authenticated` only.
- RLS: admin read policies across all tables via `has_role`; student material/subject reads scoped to their profile regulation and `status='active'`; faculty write policies unchanged plus status check. GRANTs on every new table.
- Storage `materials` bucket policies updated to the same regulation + status rules.

Frontend:

- `src/routes/auth.tsx`: remove role from sign-up metadata; register form gains department + ID + confirm password; register tab hidden for faculty/admin flows.
- `src/lib/use-auth.ts`: expose `status`, `department`, ids; sign out disabled accounts.
- `src/components/app-header.tsx`: role badge + role-driven nav.
- `src/routes/_authenticated/admin.tsx` rebuilt with tabbed sections; role/status mutations go through `src/lib/admin.functions.ts` server functions calling the RPCs.
- `src/routes/_authenticated/teacher.tsx`: add description field to upload, section tabs.
- `src/routes/_authenticated/student.tsx`: search bar, read-only profile + edit-request form; keep the existing pdfjs canvas viewer and proxy download path.
- Recharts for all charts.
