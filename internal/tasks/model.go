package tasks

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/url"
	"slices"
	"strings"
	"time"
)

var ErrConflict = errors.New("任務已被更新，請重新讀取後再操作")
var ErrNotFound = errors.New("找不到任務")
var ErrInvalid = errors.New("無效的輸入")

type Link struct {
	URL string `json:"url"`
}

type Task struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	ScheduledDate string     `json:"scheduled_date"`
	ProjectID     string     `json:"project_id,omitempty"`
	Description   string     `json:"description"`
	CompletedAt   *time.Time `json:"completed_at"`
	DeletedAt     *time.Time `json:"deleted_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	Version       int        `json:"version"`
	Links         []Link     `json:"links"`
}

type CreateInput struct {
	Title         string `json:"title"`
	ScheduledDate string `json:"scheduled_date"`
	ProjectID     string `json:"project_id"`
	Description   string `json:"description"`
	Links         []Link `json:"links"`
}

type Action struct {
	Op            string  `json:"op"`
	ScheduledDate *string `json:"scheduled_date"`
	ProjectID     *string `json:"project_id"`
	Version       int     `json:"version"`
	Links         []Link  `json:"links"`
	LinkIndex     *int    `json:"link_index"`
	Title         *string `json:"title"`
	Description   *string `json:"description"`
}

func id() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func validate(t Task) error {
	if strings.TrimSpace(t.Title) == "" {
		return errors.New("請填寫任務名稱")
	}
	if t.ScheduledDate != "" {
		d, err := time.Parse(time.DateOnly, t.ScheduledDate)
		if err != nil || d.Year() < 1 || d.Format(time.DateOnly) != t.ScheduledDate {
			return errors.New("任務日期須為有效的 YYYY-MM-DD，或留空")
		}
	}
	for _, link := range t.Links {
		u, err := url.Parse(link.URL)
		if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
			return errors.New("連結需要有效的 HTTP / HTTPS URL")
		}
	}
	return nil
}

func newTask(in CreateInput, now time.Time) (Task, error) {
	t := Task{
		ID: id(), Title: strings.TrimSpace(in.Title), ScheduledDate: in.ScheduledDate,
		ProjectID: in.ProjectID, Description: in.Description, Version: 1, CreatedAt: now, UpdatedAt: now,
		Links: make([]Link, 0, len(in.Links)),
	}
	t.appendLinks(in.Links)
	return t, validate(t)
}

func (t *Task) appendLinks(links []Link) {
	for _, link := range links {
		t.Links = append(t.Links, Link{URL: strings.TrimSpace(link.URL)})
	}
}

func apply(t *Task, a Action, now time.Time) error {
	switch a.Op {
	case "rename":
		if a.Title == nil || strings.TrimSpace(*a.Title) == "" {
			return errors.New("標題不可空白")
		}
		t.Title = strings.TrimSpace(*a.Title)
	case "delete_item":
		t.DeletedAt = &now
	case "reopen_task":
		if t.CompletedAt == nil {
			return errors.New("任務尚未完成")
		}
		t.CompletedAt = nil
	case "add_link":
		if len(a.Links) == 0 {
			return errors.New("請提供相關連結")
		}
	case "remove_link":
		if a.LinkIndex == nil || *a.LinkIndex < 0 || *a.LinkIndex >= len(t.Links) {
			return errors.New("找不到指定的連結")
		}
		if len(a.Links) != 0 {
			return errors.New("刪除連結時不可同時新增連結")
		}
		t.Links = slices.Delete(t.Links, *a.LinkIndex, *a.LinkIndex+1)
	case "update":
		if a.ProjectID != nil {
			t.ProjectID = *a.ProjectID
		}
		if a.ScheduledDate != nil {
			t.ScheduledDate = *a.ScheduledDate
		}
		if a.Description != nil {
			t.Description = *a.Description
		}
		if a.Title != nil {
			t.Title = strings.TrimSpace(*a.Title)
		}
	case "complete_task":
		if t.CompletedAt != nil {
			return errors.New("任務已完成")
		}
		t.CompletedAt = &now
	default:
		return errors.New("不支援的操作")
	}
	t.appendLinks(a.Links)
	if err := validate(*t); err != nil {
		return err
	}
	t.Version++
	t.UpdatedAt = now
	return nil
}
