"use client";

type AvatarMember = { id: string; name: string };

export default function MemberAvatarGroup({ members, loading, onOpen, onPrefetch }: { members: AvatarMember[]; loading: boolean; onOpen: () => void; onPrefetch: () => void }) {
  const visibleMembers = members.slice(0, 4);
  const additionalMembers = Math.max(0, members.length - visibleMembers.length);
  const labels = members.map((member) => member.name).join(", ");

  return <div className="member-avatar-control" onFocus={onPrefetch} onMouseEnter={onPrefetch}>
    <button aria-label={members.length ? `Open members: ${labels}` : "Open member directory"} className="member-avatar-group" onClick={onOpen} type="button">
      {visibleMembers.length > 0 ? visibleMembers.map((member) => <span aria-hidden="true" className="member-avatar" key={member.id}>{member.name[0]?.toUpperCase()}</span>) : <><span aria-hidden="true" className="member-avatar member-avatar-placeholder">•</span><span aria-hidden="true" className="member-avatar member-avatar-placeholder">•</span></>}
      {additionalMembers > 0 && <span aria-hidden="true" className="member-avatar member-avatar-count">+{additionalMembers}</span>}
      {loading && <span aria-hidden="true" className="member-avatar-loading" />}
    </button>
    {members.length > 0 && <div className="member-name-reveal" role="tooltip"><strong>People</strong><span>{labels}</span></div>}
  </div>;
}
