export function restoreLivingPartyMembers(party) {
  party.forEach((member) => {
    if (member.hp > 0) {
      member.hp = member.max_hp;
      member.mp = member.max_mp;
    }
  });
}
