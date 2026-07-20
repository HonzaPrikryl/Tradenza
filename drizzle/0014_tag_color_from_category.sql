-- Data migration: a tag wears its category's colour, but `tags.color` is a
-- denormalised copy taken at creation time, so recolouring a category left the
-- existing tags on the old colour. The cascade in `updateTagGroup` keeps them in
-- sync from now on; this realigns the rows that already drifted.
UPDATE "tags" AS t
SET "color" = g."color"
FROM "tag_groups" AS g
WHERE t."group_id" = g."id"
  AND t."color" <> g."color";
