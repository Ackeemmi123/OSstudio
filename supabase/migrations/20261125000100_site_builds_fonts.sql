/* The company design (services@0.1) ships its own web fonts with every site it builds. */
update storage.buckets
   set allowed_mime_types = array(select distinct unnest(allowed_mime_types || array['font/woff2']))
 where id = 'site-builds';
