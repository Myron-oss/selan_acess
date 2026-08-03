import "server-only";

import { mapMessage } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Message, Poll, PollOption, PollVoter } from "@/lib/types";

type DataRow = Record<string, unknown>;

export async function loadPollsById(
  pollIds: string[],
  currentUserTgId: number
): Promise<Map<string, Poll>> {
  const uniquePollIds = Array.from(new Set(pollIds));
  if (uniquePollIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabaseAdmin();
  const [pollResult, optionResult] = await Promise.all([
    supabase
      .from("polls")
      .select(
        "id,channel_id,creator_tg_id,question,is_anonymous,allows_multiple_answers,created_at"
      )
      .in("id", uniquePollIds),
    supabase
      .from("poll_options")
      .select("id,poll_id,option_text,position")
      .in("poll_id", uniquePollIds)
      .order("position", { ascending: true })
  ]);

  if (pollResult.error) {
    throw pollResult.error;
  }
  if (optionResult.error) {
    throw optionResult.error;
  }

  const pollRows = (pollResult.data ?? []) as DataRow[];
  const optionRows = (optionResult.data ?? []) as DataRow[];
  const optionIds = optionRows.map((option) => String(option.id));
  const optionToPoll = new Map(
    optionRows.map((option) => [String(option.id), String(option.poll_id)])
  );

  const { data: voteRows, error: voteError } = optionIds.length
    ? await supabase
        .from("poll_votes")
        .select("poll_option_id,voter_tg_id")
        .in("poll_option_id", optionIds)
    : { data: [], error: null };

  if (voteError) {
    throw voteError;
  }

  const anonymousPollIds = new Set(
    pollRows
      .filter((poll) => Boolean(poll.is_anonymous))
      .map((poll) => String(poll.id))
  );
  const visibleVoterIds = Array.from(
    new Set(
      (voteRows ?? [])
        .filter(
          (vote) =>
            !anonymousPollIds.has(
              optionToPoll.get(String(vote.poll_option_id)) ?? ""
            )
        )
        .map((vote) => String(vote.voter_tg_id))
    )
  );
  const voterById = new Map<string, PollVoter>();

  if (visibleVoterIds.length > 0) {
    const { data: employees, error: employeeError } = await supabase
      .from("employees")
      .select("tg_id,full_name")
      .in("tg_id", visibleVoterIds);

    if (employeeError) {
      throw employeeError;
    }

    for (const employee of employees ?? []) {
      voterById.set(String(employee.tg_id), {
        tg_id: Number(employee.tg_id),
        full_name: String(employee.full_name)
      });
    }
  }

  const votesByOption = new Map<string, Array<{ voter_tg_id: number }>>();
  for (const vote of voteRows ?? []) {
    const optionId = String(vote.poll_option_id);
    const votes = votesByOption.get(optionId) ?? [];
    votes.push({ voter_tg_id: Number(vote.voter_tg_id) });
    votesByOption.set(optionId, votes);
  }

  const optionsByPoll = new Map<string, PollOption[]>();
  for (const option of optionRows) {
    const pollId = String(option.poll_id);
    const optionId = String(option.id);
    const votes = votesByOption.get(optionId) ?? [];
    const pollOptions = optionsByPoll.get(pollId) ?? [];
    pollOptions.push({
      id: optionId,
      option_text: String(option.option_text),
      position: Number(option.position),
      vote_count: votes.length,
      percentage: 0,
      selected_by_current_user: votes.some(
        (vote) => vote.voter_tg_id === currentUserTgId
      ),
      voters: anonymousPollIds.has(pollId)
        ? null
        : votes
            .map((vote) => voterById.get(String(vote.voter_tg_id)))
            .filter((voter): voter is PollVoter => Boolean(voter))
    });
    optionsByPoll.set(pollId, pollOptions);
  }

  const polls = new Map<string, Poll>();
  for (const row of pollRows) {
    const pollId = String(row.id);
    const options = optionsByPoll.get(pollId) ?? [];
    const totalVotes = options.reduce(
      (sum, option) => sum + option.vote_count,
      0
    );

    polls.set(pollId, {
      id: pollId,
      channel_id: String(row.channel_id),
      creator_tg_id: Number(row.creator_tg_id),
      question: String(row.question),
      is_anonymous: Boolean(row.is_anonymous),
      allows_multiple_answers: Boolean(row.allows_multiple_answers),
      total_votes: totalVotes,
      options: options.map((option) => ({
        ...option,
        percentage:
          totalVotes === 0
            ? 0
            : Math.round((option.vote_count / totalVotes) * 100)
      })),
      created_at: String(row.created_at)
    });
  }

  return polls;
}

export async function loadPollMessage(
  pollId: string,
  currentUserTgId: number
): Promise<Message | null> {
  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from("messages")
    .select(
      "id,channel_id,sender_tg_id,sender_name,text,file_url,file_type,file_name,file_size,poll_id,created_at,updated_at"
    )
    .eq("poll_id", pollId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!row) {
    return null;
  }

  const [{ data: sender, error: senderError }, polls] = await Promise.all([
    supabase
      .from("employees")
      .select("avatar_url")
      .eq("tg_id", String(row.sender_tg_id))
      .maybeSingle(),
    loadPollsById([pollId], currentUserTgId)
  ]);

  if (senderError) {
    throw senderError;
  }

  const message = mapMessage(
    row as Record<string, unknown>,
    typeof sender?.avatar_url === "string" ? sender.avatar_url : null
  );
  return { ...message, poll: polls.get(pollId) ?? null };
}
