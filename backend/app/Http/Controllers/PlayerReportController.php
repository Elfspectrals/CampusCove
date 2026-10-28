<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Services\AccountMailer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Player reports (DSA notice-and-action): players file them, admins review them. A decision is e-mailed to the
 * reporter (art. 16.5) and, when action is taken, to the reported player with its reasons (art. 17).
 * Uses `player_reports`; the legacy `reports` table needs a server/room and is not wired to the game.
 */
class PlayerReportController extends Controller
{
    private const REASONS = 'harassment,hate,cheating,username,scam,other';

    public function store(Request $request): JsonResponse
    {
        /** @var Account $reporter */
        $reporter = $request->user();
        $validated = $request->validate([
            'target_account_id' => 'required|integer|exists:accounts,account_id',
            'reason' => 'required|string|in:'.self::REASONS,
            'details' => 'nullable|string|max:1000',
        ]);
        $targetId = (int) $validated['target_account_id'];
        if ($targetId === (int) $reporter->account_id) {
            throw ValidationException::withMessages(['target_account_id' => ['You cannot report yourself.']]);
        }

        $duplicate = DB::table('player_reports')
            ->where('reporter_account_id', $reporter->account_id)
            ->where('target_account_id', $targetId)
            ->where('status', 'open')
            ->exists();
        if (! $duplicate) {
            DB::table('player_reports')->insert([
                'reporter_account_id' => $reporter->account_id,
                'target_account_id' => $targetId,
                'reason' => $validated['reason'],
                'details' => $validated['details'] ?? null,
            ]);
        }

        return response()->json(['message' => 'Report received.'], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status', 'open');
        $reports = DB::table('player_reports as r')
            ->leftJoin('account_handles as rh', 'rh.account_id', '=', 'r.reporter_account_id')
            ->join('account_handles as th', 'th.account_id', '=', 'r.target_account_id')
            ->when(in_array($status, ['open', 'actioned', 'dismissed'], true), fn ($q) => $q->where('r.status', $status))
            ->orderByDesc('r.created_at')
            ->limit(200)
            ->get(['r.*', 'rh.username as reporter_username', 'th.username as target_username']);

        return response()->json(['reports' => $reports]);
    }

    public function update(Request $request, int $id, AccountMailer $mailer): JsonResponse
    {
        $validated = $request->validate([
            'status' => 'required|string|in:actioned,dismissed',
            'decision_note' => 'nullable|string|max:1000',
        ]);
        $report = DB::table('player_reports')->where('id', $id)->first();
        abort_if($report === null, 404);

        $note = $validated['decision_note'] ?? null;
        DB::table('player_reports')->where('id', $id)->update([
            'status' => $validated['status'],
            'decision_note' => $note,
            'resolved_at' => now(),
        ]);

        $actioned = $validated['status'] === 'actioned';
        if ($report->reporter_account_id !== null) {
            $mailer->send(
                (int) $report->reporter_account_id,
                'Suite donnée à ton signalement / Your report was reviewed',
                $actioned ? 'Ton signalement a été examiné et des mesures ont été prises. Merci.' : 'Ton signalement a été examiné ; aucune infraction aux règles n’a été retenue.',
                $actioned ? 'Your report was reviewed and action was taken. Thank you.' : 'Your report was reviewed; no breach of the rules was found.',
            );
        }
        if ($actioned) {
            $reasons = $note !== null && $note !== '' ? $note : $report->reason;
            $mailer->send(
                (int) $report->target_account_id,
                'Décision de modération / Moderation decision',
                "Suite à un signalement (motif : {$report->reason}), la modération a pris une mesure sur ton compte. Motivation : {$reasons}. Tu peux contester cette décision en répondant à cet e-mail.",
                "Following a report (reason: {$report->reason}), moderation took action on your account. Reasons: {$reasons}. You can contest this decision by replying to this e-mail.",
            );
        }

        return response()->json(['message' => 'Report updated.']);
    }
}
