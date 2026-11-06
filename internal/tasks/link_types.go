package tasks

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

func defaultLinkTypes() []Option {
	return []Option{
		{ID: "pr", Name: "GitHub PR", Color: optionColors[6].Color},
		{ID: "issue", Name: "GitHub Issue", Color: optionColors[1].Color},
		{ID: "asana", Name: "Asana", Color: optionColors[0].Color},
		{ID: "slack", Name: "Slack", Color: optionColors[4].Color},
		{ID: "document", Name: "文件", Color: optionColors[5].Color},
		{ID: "other", Name: "其他", Color: optionColors[15].Color},
	}
}

// Bind new links to configured IDs. Existing links, including retired kinds,
// remain untouched; repeated kinds are intentionally preserved in the slice.
func (c Settings) normalizeLinks(links []Link) ([]Link, error) {
	out := append([]Link(nil), links...)
	for i := range out {
		link := &out[i]
		link.URL = strings.TrimSpace(link.URL)
		var option *Option
		if link.TypeID != "" {
			option = findOption(c.LinkTypes, link.TypeID)
		} else if link.Type == "" {
			// URL-only input keeps attaching context independent of configuration.
			// Explicit kinds still use the existing validation below.
			for _, kind := range []string{inferLinkType(link.URL), "other", c.DefaultLinkType} {
				if candidate := findOption(c.LinkTypes, kind); candidate != nil && !candidate.Disabled {
					option = candidate
					break
				}
			}
		} else {
			for j := range c.LinkTypes {
				candidate := &c.LinkTypes[j]
				if candidate.ID == link.Type || candidate.Name == link.Type {
					option = candidate
					break
				}
			}
			// Preserve the commonly used Agent API spelling for the built-in PR kind.
			if option == nil && link.Type == "PR" {
				option = findOption(c.LinkTypes, "pr")
			}
		}
		if option == nil || option.Disabled {
			return nil, fmt.Errorf("請選擇有效且啟用中的連結種類")
		}
		link.TypeID = option.ID
		link.Type = option.Name
	}
	return out, nil
}

func inferLinkType(value string) string {
	u, err := url.Parse(value)
	if err != nil {
		return "other"
	}
	host := strings.ToLower(u.Hostname())
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if host == "github.com" && len(parts) >= 4 {
		switch parts[2] {
		case "pull":
			return "pr"
		case "issues":
			return "issue"
		}
	}
	switch {
	case host == "slack.com" || strings.HasSuffix(host, ".slack.com"):
		return "slack"
	case host == "asana.com" || strings.HasSuffix(host, ".asana.com"):
		return "asana"
	case host == "docs.google.com" || host == "drive.google.com":
		return "document"
	default:
		return "other"
	}
}

func migrateLinkTypes(tx *sql.Tx) error {
	var raw string
	if err := tx.QueryRow(`SELECT document FROM settings WHERE id=1`).Scan(&raw); err != nil {
		return err
	}
	var cfg Settings
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return err
	}
	if cfg.LinkTypes == nil {
		cfg.LinkTypes = defaultLinkTypes()
		cfg.DefaultLinkType = "pr"
	}
	rows, err := tx.Query(`SELECT id,document FROM tasks`)
	if err != nil {
		return err
	}
	type update struct{ id, document, links string }
	updates := []update{}
	for rows.Next() {
		var key, raw string
		if err = rows.Scan(&key, &raw); err != nil {
			rows.Close()
			return err
		}
		var document map[string]json.RawMessage
		if err = json.Unmarshal([]byte(raw), &document); err != nil {
			rows.Close()
			return err
		}
		var links []Link
		if value, ok := document["links"]; ok {
			if err = json.Unmarshal(value, &links); err != nil {
				rows.Close()
				return err
			}
		}
		if len(links) == 0 {
			continue
		}
		for i := range links {
			link := &links[i]
			name := strings.TrimSpace(link.Type)
			if name == "" {
				name = "其他"
			}
			option := findOption(cfg.LinkTypes, link.TypeID)
			if option == nil {
				for j := range cfg.LinkTypes {
					if strings.TrimSpace(cfg.LinkTypes[j].Name) == name {
						option = &cfg.LinkTypes[j]
						break
					}
				}
			}
			if option == nil {
				cfg.LinkTypes = append(cfg.LinkTypes, Option{ID: "legacy-" + id(), Name: name, Color: optionColors[len(cfg.LinkTypes)%len(optionColors)].Color})
				option = &cfg.LinkTypes[len(cfg.LinkTypes)-1]
			}
			link.TypeID = option.ID
		}
		encoded, err := json.Marshal(links)
		if err != nil {
			rows.Close()
			return err
		}
		document["links"] = encoded
		doc, err := json.Marshal(document)
		if err != nil {
			rows.Close()
			return err
		}
		updates = append(updates, update{key, string(doc), string(encoded)})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, u := range updates {
		if _, err = tx.Exec(`UPDATE tasks SET document=?,links=? WHERE id=?`, u.document, u.links, u.id); err != nil {
			return err
		}
	}
	encoded, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`UPDATE settings SET document=? WHERE id=1`, string(encoded))
	return err
}
