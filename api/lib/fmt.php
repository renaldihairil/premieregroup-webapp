<?php
declare(strict_types=1);

/**
 * DB row (snake_case, integer ids) -> API object (camelCase) that matches the
 * EXACT field names the existing frontend already reads. This mapping layer is
 * what lets the ~15 page render() functions stay untouched.
 *
 * IDS AND FOREIGN KEYS ARE EMITTED AS STRINGS. The frontend was written for
 * opaque string ids ("usr_ab12cd") and compares them with === against <select>
 * values (which are always strings). Casting every id/FK to string here keeps
 * that behaviour intact with zero screen changes.
 *
 * DATETIME values are emitted as bare local strings "YYYY-MM-DDTHH:MM:SS"
 * (no timezone suffix). The app is single-region WITA and the DB connection is
 * pinned to +08:00, so `new Date(str)` on any WITA browser shows the same
 * wall-clock time the server recorded.
 */

function id_str($v): ?string
{
    return $v === null ? null : (string) $v;
}

function dt(?string $v): ?string
{
    if ($v === null || $v === '' || str_starts_with($v, '0000')) {
        return null;
    }
    return str_replace(' ', 'T', substr($v, 0, 19));
}

function photo_url(string $bucket, $id, string $slot): string
{
    // slot: "in" | "out" (attendance)  |  "start" | "end" (overtime)
    return 'api/photo?rec=' . $bucket . '&id=' . (string) $id . '&slot=' . $slot;
}

function fmt_post(array $r): array
{
    return [
        'id'            => id_str($r['id']),
        'ownerKind'     => $r['owner_kind'],
        'ownerId'       => id_str($r['owner_id']),
        'authorName'    => $r['author_name'] ?? 'Karyawan',
        // `&v=` = same content-versioning scheme as fmt_user()'s photoUrl — without
        // it the URL never changes when the author re-uploads their profile photo,
        // so the client's cached blob for "api/profile-photo?id=N" never refreshes
        // and every post (old AND newly created) keeps showing the old photo.
        'authorPhotoUrl' => ($r['owner_kind'] === 'user' && !empty($r['author_photo_path']))
            ? ('api/profile-photo?id=' . (int) $r['owner_id']
               . '&v=' . substr(pathinfo((string) $r['author_photo_path'], PATHINFO_FILENAME), 0, 12))
            : null,
        'photoUrl'      => !empty($r['photo_path']) ? ('api/post-photo?id=' . (string) $r['id']) : null,
        'videoUrl'      => !empty($r['video_path'])
            ? ('api/post-video?id=' . (string) $r['id'] . '&k=' . pg_post_video_token((int) $r['id']))
            : null,
        'videoMime'     => $r['video_mime'] ?? null,
        'caption'       => $r['caption'] ?? '',
        'createdAt'     => dt($r['created_at'] ?? null),
        'expiresAt'     => dt($r['expires_at'] ?? null),
        'likeCount'     => (int) ($r['like_count'] ?? 0),
        'commentCount'  => (int) ($r['comment_count'] ?? 0),
        'likedByMe'     => !empty($r['liked_by_me']),
        'isMine'        => !empty($r['is_mine']),
    ];
}

function fmt_post_comment(array $r): array
{
    return [
        'id'            => id_str($r['id']),
        'postId'        => id_str($r['post_id']),
        'commenterKind' => $r['commenter_kind'],
        'commenterId'   => id_str($r['commenter_id']),
        'authorName'    => $r['author_name'] ?? 'Karyawan',
        'authorPhotoUrl' => ($r['commenter_kind'] === 'user' && !empty($r['author_photo_path']))
            ? ('api/profile-photo?id=' . (int) $r['commenter_id']
               . '&v=' . substr(pathinfo((string) $r['author_photo_path'], PATHINFO_FILENAME), 0, 12))
            : null,
        'parentId'      => (isset($r['parent_comment_id']) && $r['parent_comment_id'] !== null) ? id_str($r['parent_comment_id']) : null,
        'text'          => $r['comment_text'],
        'createdAt'     => dt($r['created_at'] ?? null),
        'isMine'        => !empty($r['is_mine']),
        'likeCount'     => (int) ($r['like_count'] ?? 0),
        'likedByMe'     => !empty($r['liked_by_me']),
    ];
}

function fmt_notification(array $r): array
{
    return [
        'id'        => id_str($r['id']),
        'type'      => $r['type'],
        'title'     => $r['title'],
        'body'      => $r['body'] ?? '',
        'link'      => $r['link'] ?? null,
        'actorId'   => id_str($r['actor_user_id'] ?? null),
        'actorName' => $r['actor_name'] ?? null,
        'read'      => !empty($r['read_at']),
        'createdAt' => dt($r['created_at'] ?? null),
    ];
}

function fmt_division(array $r): array
{
    return [
        'id'          => id_str($r['id']),
        'name'        => $r['name'],
        'description' => $r['description'],
        'status'      => $r['status'],
        'createdAt'   => dt($r['created_at'] ?? null),
    ];
}

function fmt_position(array $r): array
{
    return [
        'id'        => id_str($r['id']),
        'name'      => $r['name'],
        'status'    => $r['status'],
        'createdAt' => dt($r['created_at'] ?? null),
    ];
}

function fmt_branch(array $r): array
{
    return [
        'id'        => id_str($r['id']),
        'name'      => $r['name'],
        'status'    => $r['status'],
        'createdAt' => dt($r['created_at'] ?? null),
    ];
}

function fmt_store(array $r): array
{
    return [
        'id'          => id_str($r['id']),
        'name'        => $r['name'],
        'description' => $r['description'] ?? null,
        'status'      => $r['status'],
        'createdAt'   => dt($r['created_at'] ?? null),
        'updatedAt'   => dt($r['updated_at'] ?? null),
    ];
}

function fmt_user(array $r): array
{
    $primary = id_str($r['division_id']);
    // division_ids: comma-joined GROUP_CONCAT from user_divisions when the query
    // supplies it; otherwise fall back to the single primary division.
    $ids = [];
    if (array_key_exists('division_ids', $r) && $r['division_ids'] !== null && $r['division_ids'] !== '') {
        foreach (explode(',', (string) $r['division_ids']) as $d) {
            $d = trim($d);
            if ($d !== '' && !in_array($d, $ids, true)) {
                $ids[] = $d;
            }
        }
    } elseif ($primary !== null) {
        $ids = [$primary];
    }
    // Keep the primary division first.
    if ($primary !== null) {
        $ids = array_values(array_merge([$primary], array_filter($ids, static fn($x) => $x !== $primary)));
    }

    return [
        'id'          => id_str($r['id']),
        'fullName'    => $r['full_name'],
        'username'    => $r['username'],
        'divisionId'  => $primary,
        'divisionIds' => $ids,
        'positionId'  => id_str($r['position_id']),
        'branchId'    => id_str($r['branch_id']),
        'role'        => $r['role'],
        'status'      => $r['status'],
        // `v` = first 12 chars of the (random per-upload) stored filename, so the
        // URL changes whenever the photo does. A stable, content-versioned URL lets
        // the browser HTTP-cache the image hard and reuse it across renders/pages
        // without any re-fetch — while a new upload still busts the cache.
        'photoUrl'    => !empty($r['photo_path'])
            ? ('api/profile-photo?id=' . (int) $r['id']
               . '&v=' . substr(pathinfo((string) $r['photo_path'], PATHINFO_FILENAME), 0, 12))
            : null,
        'createdAt'   => dt($r['created_at'] ?? null),
        'updatedAt'   => dt($r['updated_at'] ?? null),
    ];
}

function fmt_attendance(array $r): array
{
    $id = (int) $r['id'];
    return [
        'id'            => id_str($r['id']),
        'userId'        => id_str($r['user_id']),
        'date'          => $r['attendance_date'],
        'checkInAt'     => dt($r['check_in_at']),
        'checkInPhoto'  => !empty($r['check_in_photo']) ? photo_url('attendance', $id, 'in') : null,
        'checkOutAt'    => dt($r['check_out_at']),
        'checkOutPhoto' => !empty($r['check_out_photo']) ? photo_url('attendance', $id, 'out') : null,
        'checkInStatus' => $r['check_in_status'],
        'lateMinutes'   => (int) $r['late_minutes'],
        'createdAt'     => dt($r['created_at'] ?? null),
        'updatedAt'     => dt($r['updated_at'] ?? null),
    ];
}

function fmt_izin(array $r): array
{
    $id = (int) $r['id'];
    return [
        'id'        => id_str($r['id']),
        'userId'    => id_str($r['user_id']),
        'date'      => $r['izin_date'],
        'reason'    => $r['reason'],
        'photo'     => !empty($r['photo']) ? photo_url('izin', $id, 'selfie') : null,
        'createdAt' => dt($r['created_at'] ?? null),
        'updatedAt' => dt($r['updated_at'] ?? null),
    ];
}

function fmt_expense(array $r): array
{
    $id = (int) $r['id'];
    return [
        'id'        => id_str($r['id']),
        'userId'    => id_str($r['user_id']),
        'name'      => $r['name'],
        'date'      => $r['expense_date'],
        'amount'    => (int) $r['amount'],
        'note'      => $r['note'],
        'photoUrl'  => 'api/expense-file?id=' . $id,
        'photoName' => $r['photo_name'],
        'photoSize' => $r['photo_size'] !== null ? (int) $r['photo_size'] : null,
        'createdAt' => dt($r['created_at'] ?? null),
        'updatedAt' => dt($r['updated_at'] ?? null),
    ];
}

function fmt_warehouse_receipt(array $r): array
{
    return [
        'id'           => id_str($r['id']),
        'userId'       => id_str($r['user_id']),
        'userName'     => $r['user_name'] ?? null,
        'status'       => $r['status'] ?? 'submitted',
        'date'         => $r['receipt_date'],
        'itemName'     => $r['item_name'],
        'supplier'     => $r['supplier'],
        'resiNo'       => $r['resi_no'],
        'qty'          => (int) $r['qty'],
        'unitPrice'    => (int) $r['unit_price'],
        'totalPrice'   => (int) $r['total_price'],
        'shippingCost' => (int) $r['shipping_cost'],
        'note'         => $r['note'],
        'receivedDate' => $r['received_date'] ?: null,
        'goodsStatus'  => $r['goods_status'] ?: null,
        'payment'      => $r['payment'] ?? '',
        'paymentStatus' => $r['payment_status'] ?? 'belum_lunas',
        'dueDate'      => $r['due_date'] ?: null,
        'shipping'     => $r['shipping'] ?? '',
        'koli'         => (int) $r['koli'],
        // Division context is only joined for the cross-staff "Laporan Resi"
        // view; the owner's own list / bootstrap leave these unset.
        'divisionNames' => $r['division_names'] ?? ($r['division_name'] ?? null),
        'divisionIds'  => (isset($r['division_ids']) && $r['division_ids'] !== null && $r['division_ids'] !== '')
            ? array_values(array_unique(array_filter(array_map('trim', explode(',', (string) $r['division_ids'])))))
            : [],
        'createdAt'    => dt($r['created_at'] ?? null),
        'updatedAt'    => dt($r['updated_at'] ?? null),
    ];
}

function fmt_warehouse_supplier(array $r): array
{
    return [
        'id'        => id_str($r['id']),
        'name'      => $r['name'],
        'createdAt' => dt($r['created_at'] ?? null),
        'updatedAt' => dt($r['updated_at'] ?? null),
    ];
}

function fmt_piket(array $r): array
{
    return [
        'id'        => id_str($r['id']),
        'dayOfWeek' => $r['day_of_week'],
        'userId'    => id_str($r['user_id']),
        'note'      => $r['note'],
        'createdAt' => dt($r['created_at'] ?? null),
    ];
}

function fmt_piket_settings(array $r): array
{
    return [
        'reminderTime'   => substr((string) ($r['reminder_time'] ?? '07:00:00'), 0, 5),
        'enabled'        => array_key_exists('enabled', $r) ? (bool) $r['enabled'] : true,
        'fridayTime'     => substr((string) ($r['friday_time'] ?? '07:00:00'), 0, 5),
        'fridayEnabled'  => array_key_exists('friday_enabled', $r) ? (bool) $r['friday_enabled'] : true,
        'fridayMessage'  => $r['friday_message'] ?? null,
    ];
}

function fmt_overtime(array $r): array
{
    $id = (int) $r['id'];
    return [
        'id'              => id_str($r['id']),
        'userId'          => id_str($r['user_id']),
        'attendanceId'    => id_str($r['attendance_id']),
        'date'            => $r['overtime_date'],
        'description'     => $r['description'],
        'startAt'         => dt($r['start_at']),
        'startPhoto'      => !empty($r['start_photo']) ? photo_url('overtime', $id, 'start') : null,
        'endAt'           => dt($r['end_at']),
        'endPhoto'        => !empty($r['end_photo']) ? photo_url('overtime', $id, 'end') : null,
        'durationMs'      => (int) $r['duration_ms'],
        'status'          => $r['status'],
        'rejectionReason' => $r['rejection_reason'],
        'approvedBy'      => $r['approved_by_name'] ?? null,
        'approvedAt'      => dt($r['approved_at']),
        'createdAt'       => dt($r['created_at'] ?? null),
        'updatedAt'       => dt($r['updated_at'] ?? null),
    ];
}

function fmt_todo(array $r): array
{
    return [
        'id'          => id_str($r['id']),
        'title'       => $r['title'],
        'description' => $r['description'],
        'userNote'    => $r['user_note'] ?? null,
        'divisionId'  => id_str($r['division_id']),
        'assigneeId'  => id_str($r['assignee_id']),
        'programId'   => id_str($r['program_id'] ?? null),
        'programName' => $r['program_name'] ?? null,
        'priority'    => $r['priority'],
        'status'      => $r['status'],
        'progress'    => (int) $r['progress'],
        'deadline'    => $r['deadline'],
        'completedAt' => dt($r['completed_at'] ?? null),
        'attachmentCount' => isset($r['attachment_count']) ? (int) $r['attachment_count'] : 0,
        'createdByUserId' => id_str($r['created_by_user_id'] ?? null),
        'createdBySource' => !empty($r['created_by_user_id']) ? 'user' : 'admin',
        'createdByName'   => $r['creator_name'] ?? null,
        'createdByDivision' => $r['creator_division_name'] ?? null,
        'createdAt'   => dt($r['created_at'] ?? null),
        'updatedAt'   => dt($r['updated_at'] ?? null),
    ];
}

function fmt_kpi_template(array $r): array
{
    return [
        'id'          => id_str($r['id']),
        'name'        => $r['name'],
        'divisionId'  => id_str($r['division_id']),
        'divisionName' => $r['division_name'] ?? null,
        'periodType'  => $r['period_type'],
        'scoreMethod' => $r['score_method'],
        'description' => $r['description'],
        'status'      => $r['status'],
        'itemCount'   => isset($r['item_count']) ? (int) $r['item_count'] : null,
        'reportCount' => isset($r['report_count']) ? (int) $r['report_count'] : null,
        'createdAt'   => dt($r['created_at'] ?? null),
        'updatedAt'   => dt($r['updated_at'] ?? null),
    ];
}

function fmt_kpi_item(array $r): array
{
    $vt = $r['value_type'] ?? (!empty($r['is_currency']) ? 'money' : 'number');
    return [
        'id'         => id_str($r['id']),
        'templateId' => id_str($r['template_id']),
        'parentId'   => id_str($r['parent_id']),
        'label'      => $r['label'],
        'target'     => (float) $r['target'],
        'valueType'  => $vt,
        'isMoney'    => $vt === 'money',
        'isOptional' => (bool) $r['is_optional'],
        'sortOrder'  => (int) $r['sort_order'],
    ];
}

function fmt_kpi_report(array $r): array
{
    return [
        'id'           => id_str($r['id']),
        'templateId'   => id_str($r['template_id']),
        'templateName' => $r['template_name'] ?? null,
        'userId'       => id_str($r['user_id']),
        'userName'     => $r['user_name'] ?? null,
        'storeId'      => id_str($r['store_id'] ?? null),
        'storeName'    => $r['store_name'] ?? null,
        'divisionId'   => id_str($r['division_id'] ?? null),
        'divisionName' => $r['division_name'] ?? null,
        'periodKey'    => $r['period_key'] ?? '',
        'periodLabel'  => $r['period_label'] ?? '',
        'weekNo'       => $r['week_no'] !== null ? (int) $r['week_no'] : null,
        'periodStart'  => $r['period_start'] ?? null,
        'periodEnd'    => $r['period_end'] ?? null,
        'subject'      => $r['subject'] ?? '',
        'status'       => $r['status'],
        'totalPct'     => (float) $r['total_pct'],
        'totalActual'  => (float) $r['total_actual'],
        'totalTarget'  => (float) $r['total_target'],
        'note'         => $r['note'],
        'submittedAt'  => dt($r['submitted_at'] ?? null),
        'reviewedAt'   => dt($r['reviewed_at'] ?? null),
        'createdAt'    => dt($r['created_at'] ?? null),
        'updatedAt'    => dt($r['updated_at'] ?? null),
    ];
}

function fmt_attachment(array $r): array
{
    $id = (int) $r['id'];
    $isFile = $r['kind'] !== 'link' && !empty($r['file_path']);
    return [
        'id'          => id_str($r['id']),
        'todoId'      => id_str($r['todo_id']),
        'userId'      => id_str($r['user_id']),
        'kind'        => $r['kind'],
        'name'        => $r['original_name'],
        'mime'        => $r['mime'],
        'sizeBytes'   => $r['size_bytes'] !== null ? (int) $r['size_bytes'] : null,
        'url'         => $r['kind'] === 'link' ? $r['url'] : null,
        'label'       => $r['label'],
        'fileUrl'     => $isFile ? ('api/todo-file?id=' . $id) : null,
        'downloadUrl' => $isFile ? ('api/todo-file?id=' . $id . '&download=1') : null,
        'todoTitle'   => $r['todo_title'] ?? null,
        'uploaderName' => $r['uploader_name'] ?? null,
        'createdAt'   => dt($r['created_at'] ?? null),
    ];
}

function fmt_visit(array $r): array
{
    return [
        'id'           => id_str($r['id']),
        'userId'       => id_str($r['user_id']),
        'userName'     => $r['user_name'] ?? null,
        'divisionId'   => id_str($r['division_id'] ?? null),
        'divisionName' => $r['division_name'] ?? null,
        'divisionNames' => ($r['division_names'] ?? null) ?: ($r['division_name'] ?? null),
        'storeId'      => id_str($r['store_id'] ?? null),
        'storeName'    => ($r['store_name'] ?? '') !== '' ? $r['store_name'] : ($r['store_live_name'] ?? ''),
        'agenda'       => $r['agenda'],
        'visitDate'    => $r['visit_date'],
        'note'         => $r['note'],
        'status'       => $r['status'],
        'attachmentCount' => isset($r['attachment_count']) ? (int) $r['attachment_count'] : null,
        'reviewedBy'   => $r['reviewed_by_name'] ?? null,
        'reviewedAt'   => dt($r['reviewed_at'] ?? null),
        'createdAt'    => dt($r['created_at'] ?? null),
        'updatedAt'    => dt($r['updated_at'] ?? null),
    ];
}

function fmt_visit_attachment(array $r): array
{
    $id = (int) $r['id'];
    return [
        'id'              => id_str($r['id']),
        'visitId'         => id_str($r['visit_id']),
        'checklistItemId'    => isset($r['checklist_item_id']) ? id_str($r['checklist_item_id']) : null,
        'checklistItemLabel' => $r['checklist_item_label'] ?? null,
        'userId'          => id_str($r['user_id']),
        'kind'            => $r['kind'],
        'name'            => $r['original_name'],
        'mime'            => $r['mime'],
        'sizeBytes'       => $r['size_bytes'] !== null ? (int) $r['size_bytes'] : null,
        'fileUrl'         => 'api/visit-file?id=' . $id,
        'downloadUrl'     => 'api/visit-file?id=' . $id . '&download=1',
        'createdAt'       => dt($r['created_at'] ?? null),
    ];
}

function fmt_visit_checklist_item(array $r): array
{
    return [
        'id'         => id_str($r['id']),
        'divisionId' => id_str($r['division_id']),
        'label'      => $r['label'],
        'sortOrder'  => (int) $r['sort_order'],
    ];
}

function fmt_program(array $r): array
{
    $tasks = isset($r['task_count']) ? (int) $r['task_count'] : 0;
    $done  = isset($r['done_count']) ? (int) $r['done_count'] : 0;
    return [
        'id'            => id_str($r['id']),
        'name'          => $r['name'],
        'description'   => $r['description'],
        'startDate'     => $r['start_date'],
        'endDate'       => $r['end_date'],
        'coverUrl'      => !empty($r['cover_path']) ? ('api/program-cover?id=' . (int) $r['id']) : null,
        'status'        => $r['status'],
        'taskCount'     => $tasks,
        'doneCount'     => $done,
        'progressPct'   => $tasks > 0 ? (int) round($done * 100 / $tasks) : 0,
        'assigneeCount' => isset($r['assignee_count']) ? (int) $r['assignee_count'] : 0,
        'myTaskCount'   => isset($r['my_task_count']) ? (int) $r['my_task_count'] : null,
        'myDoneCount'   => isset($r['my_done_count']) ? (int) $r['my_done_count'] : null,
        'createdByName' => $r['created_by_name'] ?? null,
        'createdAt'     => dt($r['created_at'] ?? null),
        'updatedAt'     => dt($r['updated_at'] ?? null),
    ];
}

function fmt_jobdesk(array $r): array
{
    return [
        'id'            => id_str($r['id']),
        'scopeType'     => $r['scope_type'],
        'divisionId'    => id_str($r['division_id'] ?? null),
        'divisionName'  => $r['division_name'] ?? null,
        'positionId'    => id_str($r['position_id'] ?? null),
        'positionName'  => $r['position_name'] ?? null,
        'title'         => $r['title'],
        'content'       => $r['content'],
        'status'        => $r['status'],
        'updatedByName' => $r['updated_by_name'] ?? null,
        'createdAt'     => dt($r['created_at'] ?? null),
        'updatedAt'     => dt($r['updated_at'] ?? null),
    ];
}

/** attendance_settings row + holiday rows -> the object the app expects. */
function fmt_settings(array $s, array $holidayRows): array
{
    $wd = ($s['work_days'] === null || $s['work_days'] === '')
        ? []
        : explode(',', $s['work_days']);
    $holidays = array_map(
        static fn($hd) => ['date' => $hd['holiday_date'], 'label' => $hd['label']],
        $holidayRows
    );
    return [
        'checkIn'          => substr((string) $s['check_in'], 0, 5),
        'checkOut'         => substr((string) $s['check_out'], 0, 5),
        'lateToleranceMin' => (int) $s['late_tolerance_min'],
        'overtimeStart'    => substr((string) $s['overtime_start'], 0, 5),
        'overtimeEnd'      => substr((string) $s['overtime_end'], 0, 5),
        'workDays'         => $wd,
        'holidays'         => $holidays,
    ];
}

function fmt_system_settings(array $r): array
{
    return [
        'companyName' => $r['company_name'],
        'timezone'    => $r['timezone'],
        'locale'      => $r['locale'],
        'weekStart'   => $r['week_start'],
    ];
}
