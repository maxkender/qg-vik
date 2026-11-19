-- Photo de profil : une petite image (128 px) gardée telle quelle dans le profil.
alter table public.profiles add column avatar text
  check (avatar is null or (avatar ~ '^data:image/(jpeg|png|webp);base64,' and length(avatar) < 80000));
grant update (avatar) on public.profiles to authenticated;
create policy "membres : changer sa photo" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
